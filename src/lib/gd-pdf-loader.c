/*
 * Copyright (C) 2011 Red Hat, Inc.
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA
 * 02111-1307, USA.
 *
 * Authors: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

#include "gd-pdf-loader.h"

#include "e-gdata-goa-authorizer.h"

#include <string.h>
#include <gdata/gdata.h>
#include <evince-document.h>
#include <evince-view.h>

/* TODO:
 * - investigate the GDataDocumentsType bug
 */

G_DEFINE_TYPE (GdPdfLoader, gd_pdf_loader, G_TYPE_OBJECT);

enum {
  PROP_SOURCE_ID = 1,
};

typedef struct {
  GSimpleAsyncResult *result;
  GCancellable *cancellable;

  EvDocument *document;
  gchar *uri;
  gchar *pdf_path;
  GPid unoconv_pid;
  GDataDownloadStream *stream;
} PdfLoadJob;

struct _GdPdfLoaderPrivate {
  gchar *source_id;
};

/* --------------------------- utils -------------------------------- */

#define GOA_DOCS_TRACKER_PREFIX "goa:documents:"

static gchar *
strip_tracker_prefix (const gchar *source_id)
{
  if (g_str_has_prefix (source_id, GOA_DOCS_TRACKER_PREFIX))
    return g_strdup (source_id + strlen (GOA_DOCS_TRACKER_PREFIX));

  return NULL;
}

static gchar **
query_supported_document_types (void)
{
  GList *infos, *l;
  gchar **retval = NULL;
  GPtrArray *array;
  EvTypeInfo *info;
  gint idx;

  infos = ev_backends_manager_get_all_types_info ();

  if (infos == NULL)
    return NULL;

  array = g_ptr_array_new ();

  for (l = infos; l != NULL; l = l->next) {
    info = l->data;

    for (idx = 0; info->mime_types[idx] != NULL; idx++)
      g_ptr_array_add (array, g_strdup (info->mime_types[idx]));
  }

  g_ptr_array_add (array, NULL);
  retval = (gchar **) g_ptr_array_free (array, FALSE);

  return retval;
}

static gboolean
content_type_is_native (const gchar *content_type)
{
  gchar **native_types;
  gint idx;
  gboolean found = FALSE;

  native_types = query_supported_document_types ();

  for (idx = 0; native_types[idx] != NULL; idx++) {
    found = g_content_type_is_a (content_type, native_types[idx]);
    if (found)
      break;
  }

  g_strfreev (native_types);

  return found;
}

/* ----------------------- load job ------------------------------ */

static void
pdf_load_job_free (PdfLoadJob *job)
{
  g_clear_object (&job->document);
  g_clear_object (&job->result);
  g_clear_object (&job->cancellable);
  g_clear_object (&job->stream);

  g_free (job->uri);

  if (job->pdf_path != NULL) {
    g_unlink (job->pdf_path);
    g_free (job->pdf_path);
  }

  if (job->unoconv_pid != -1) {
    kill (job->unoconv_pid, SIGKILL);
    job->unoconv_pid = -1;
  }

  g_slice_free (PdfLoadJob, job);
}

static PdfLoadJob *
pdf_load_job_new (GSimpleAsyncResult *result,
                  const gchar *uri,
                  GCancellable *cancellable)
{
  PdfLoadJob *retval;

  retval = g_slice_new0 (PdfLoadJob);
  retval->result = g_object_ref (result);
  retval->cancellable = g_object_ref (cancellable);
  retval->uri = g_strdup (uri);
  retval->unoconv_pid = -1;

  return retval;
}

static void
pdf_load_job_complete_error (PdfLoadJob *job,
                             GError *error)
{
    g_simple_async_result_take_error (job->result, error);
    g_simple_async_result_complete_in_idle (job->result);

    pdf_load_job_free (job);
}

static void
pdf_load_job_complete_success (PdfLoadJob *job)
{
  g_simple_async_result_set_op_res_gpointer (job->result, g_object_ref (job->document), NULL);
  g_simple_async_result_complete_in_idle (job->result);

  pdf_load_job_free (job);
}

static void
ev_load_job_done (EvJob *ev_job,
                  gpointer user_data)
{
  PdfLoadJob *job = user_data;

  if (ev_job_is_failed (ev_job)) {
    pdf_load_job_complete_error (job, g_error_copy (ev_job->error));
    return;
  }

  job->document = g_object_ref (ev_job->document);
  g_object_unref (ev_job);

  pdf_load_job_complete_success (job);
}

static void
pdf_load_job_from_pdf (PdfLoadJob *job)
{
  EvJob *ev_job;
  gchar *uri = NULL;
  GFile *file;

  if (job->pdf_path != NULL) {
    file = g_file_new_for_path (job->pdf_path);
    uri = g_file_get_uri (file);
    g_object_unref (file);
  }

  ev_job = ev_job_load_new ((uri != NULL) ? (uri) : (job->uri));
  g_signal_connect (ev_job, "finished",
                    G_CALLBACK (ev_load_job_done), job);

  ev_job_scheduler_push_job (ev_job, EV_JOB_PRIORITY_NONE);

  g_free (uri);
}

static void
os_splice_ready_cb (GObject *source,
                    GAsyncResult *res,
                    gpointer user_data)
{
  GError *error = NULL;
  GFile *file;
  gchar *uri;
  PdfLoadJob *job = user_data;

  g_output_stream_splice_finish (G_OUTPUT_STREAM (source), res, &error);

  if (error != NULL) {
    pdf_load_job_complete_error (job, error);
    return;
  }

  pdf_load_job_from_pdf (job);
}

static void
file_replace_ready_cb (GObject *source,
                       GAsyncResult *res,
                       gpointer user_data)
{
  GFileOutputStream *os;
  GError *error = NULL;
  PdfLoadJob *job = user_data;

  os = g_file_replace_finish (G_FILE (source), res, &error);

  if (error != NULL) {
    pdf_load_job_complete_error (job, error);
    return;
  }

  g_output_stream_splice_async (G_OUTPUT_STREAM (os),
                                G_INPUT_STREAM (job->stream),
                                G_OUTPUT_STREAM_SPLICE_CLOSE_SOURCE |
                                G_OUTPUT_STREAM_SPLICE_CLOSE_TARGET,
                                G_PRIORITY_DEFAULT,
                                job->cancellable,
                                os_splice_ready_cb, job);

  g_object_unref (os);
}

static void
single_entry_ready_cb (GObject *source,
                       GAsyncResult *res,
                       gpointer user_data)
{
  GDataEntry *entry;
  GDataDownloadStream *stream;
  GError *error = NULL;
  gchar *tmp_name;
  gchar *tmp_path, *pdf_path;
  GFile *pdf_file;
  PdfLoadJob *job = user_data;

  entry = gdata_service_query_single_entry_finish (GDATA_SERVICE (source), res, &error);

  if (error != NULL) {
    pdf_load_job_complete_error (job, error);
    return;
  }

  stream = gdata_documents_document_download (GDATA_DOCUMENTS_DOCUMENT (entry),
                                              GDATA_DOCUMENTS_SERVICE (source),
                                              "pdf", job->cancellable, &error);

  if (error != NULL) {
    pdf_load_job_complete_error (job, error);
    return;
  }

  job->stream = stream;

  tmp_name = g_strdup_printf ("gnome-documents-%d.pdf", getpid ());
  tmp_path = g_build_filename (g_get_user_cache_dir (), "gnome-documents", NULL);
  job->pdf_path = pdf_path =
    g_build_filename (tmp_path, tmp_name, NULL);
  g_mkdir_with_parents (tmp_path, 0700);

  pdf_file = g_file_new_for_path (pdf_path);
  g_file_replace_async (pdf_file, NULL, FALSE,
                        G_FILE_CREATE_PRIVATE,
                        G_PRIORITY_DEFAULT,
                        job->cancellable, file_replace_ready_cb,
                        job);

  g_free (tmp_name);
  g_free (tmp_path);
  g_object_unref (pdf_file);
  g_object_unref (entry);
}

static void
pdf_load_job_from_google_documents_with_object (PdfLoadJob *job,
                                                GoaObject *object)
{
  EGDataGoaAuthorizer *authorizer;
  GDataDocumentsService *service;

  authorizer = e_gdata_goa_authorizer_new (object);
  service = gdata_documents_service_new (GDATA_AUTHORIZER (authorizer));

  /* FIXME: using GDATA_TYPE_DOCUMENTS_TEXT here is plain wrong,
   * but I can't seem to use a more generic class, or GData segfaults.
   * OTOH, using this type always works, even for presentations/spreadsheets.
   *
   * To be investigated...
   */
  gdata_service_query_single_entry_async (GDATA_SERVICE (service),
                                          gdata_documents_service_get_primary_authorization_domain (),
                                          job->uri,
                                          NULL, GDATA_TYPE_DOCUMENTS_TEXT,
                                          job->cancellable, single_entry_ready_cb, job);

  g_object_unref (service);
  g_object_unref (authorizer);
}

static void
client_ready_cb (GObject *source,
                 GAsyncResult *res,
                 gpointer user_data)
{
  GoaObject *object, *target = NULL;
  GoaAccount *account;
  GoaClient *client;
  GError *error = NULL;
  GList *accounts, *l;
  gchar *stripped_id;
  PdfLoadJob *job = user_data;
  GdPdfLoader *self;

  client = goa_client_new_finish (res, &error);

  if (error != NULL) {
    pdf_load_job_complete_error (job, error);
    return;
  }

  self = GD_PDF_LOADER (g_async_result_get_source_object (G_ASYNC_RESULT (job->result)));
  stripped_id = strip_tracker_prefix (self->priv->source_id);
  g_object_unref (self);

  if (stripped_id == NULL) {
    pdf_load_job_complete_error 
      (job,
       g_error_new_literal (G_IO_ERROR, 0,
                            "Wrong source ID; passed in a google URL, "
                            "but the source ID is not coming from GOA"));
    return;
  }

  accounts = goa_client_get_accounts (client);
  for (l = accounts; l != NULL; l = l->next) {
    object = l->data;
    account = goa_object_peek_account (object);
    
    if (account == NULL)
      continue;

    if (goa_object_peek_documents (object) == NULL)
      continue;

    if (g_strcmp0 (goa_account_get_id (account), stripped_id) == 0) {
      target = object;
      break;
    }
  }

  if (target != NULL) {
    pdf_load_job_from_google_documents_with_object (job, target);
  } else {
    pdf_load_job_complete_error 
      (job,
       g_error_new_literal (G_IO_ERROR, 0,
                            "Cannot find the specified GOA account"));
  }

  g_free (stripped_id);
  g_list_free_full (accounts, g_object_unref);
  g_object_unref (client);
}

static void
pdf_load_job_from_google_documents (PdfLoadJob *job)
{
  goa_client_new (job->cancellable, client_ready_cb, job);
}

static void
unoconv_child_watch_cb (GPid pid,
                        gint status,
                        gpointer user_data)
{
  PdfLoadJob *job = user_data;

  g_spawn_close_pid (pid);
  job->unoconv_pid = -1;

  if (g_cancellable_is_cancelled (job->cancellable)) {
    pdf_load_job_complete_error 
      (job, 
       g_error_new_literal (G_IO_ERROR, G_IO_ERROR_CANCELLED,
                            "Operation cancelled"));

    return;
  }

  pdf_load_job_from_pdf (job);
}

static void
pdf_load_job_from_openoffice (PdfLoadJob *job)
{
  gchar *doc_path, *pdf_path, *tmp_name, *tmp_path;
  GFile *file;
  gchar *cmd;

  gint argc;
  GPid pid;
  gchar **argv = NULL;
  GError *error = NULL;

  /* build the temporary PDF file path */
  file = g_file_new_for_uri (job->uri);
  doc_path = g_file_get_path (file);
  g_object_unref (file);

  tmp_name = g_strdup_printf ("gnome-documents-%d.pdf", getpid ());
  tmp_path = g_build_filename (g_get_user_cache_dir (), "gnome-documents", NULL);
  job->pdf_path = pdf_path =
    g_build_filename (tmp_path, tmp_name, NULL);
  g_mkdir_with_parents (tmp_path, 0700);

  /* call into the unoconv executable to convert the OpenOffice document
   * to the temporary PDF.
   */
  cmd = g_strdup_printf ("unoconv -f pdf -o %s %s", pdf_path, doc_path);

  g_free (doc_path);
  g_free (tmp_name);
  g_free (tmp_path);

  g_shell_parse_argv (cmd, &argc, &argv, &error);
  g_free (cmd);

  if (error != NULL) {
    pdf_load_job_complete_error (job, error);
    return;
  }

  g_spawn_async (NULL, argv, NULL,
                 G_SPAWN_DO_NOT_REAP_CHILD |
                 G_SPAWN_SEARCH_PATH,
                 NULL, NULL,
                 &pid, &error);

  g_strfreev (argv);

  if (error != NULL) {
    pdf_load_job_complete_error (job, error);
    return;
  }

  /* now watch when the unoconv child process dies */
  g_child_watch_add (pid, unoconv_child_watch_cb, job);
  job->unoconv_pid = pid;
}

static void
query_info_ready_cb (GObject *obj,
                     GAsyncResult *res,
                     gpointer user_data)
{
  PdfLoadJob *job = user_data;
  GError *error = NULL;
  GFileInfo *info;
  const gchar *content_type;

  info = g_file_query_info_finish (G_FILE (obj),
                                   res, &error);

  if (error != NULL) {
    pdf_load_job_complete_error (job, error);
    return;
  }

  content_type = g_file_info_get_content_type (info);

  if (content_type_is_native (content_type))
    pdf_load_job_from_pdf (job);
  else
    pdf_load_job_from_openoffice (job);

  g_object_unref (info);
}

static void
pdf_load_job_from_regular_file (PdfLoadJob *job)
{
  GFile *file;

  file = g_file_new_for_uri (job->uri);
  g_file_query_info_async (file,
                           G_FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE,
                           G_FILE_QUERY_INFO_NONE,
                           G_PRIORITY_DEFAULT,
                           job->cancellable,
                           query_info_ready_cb,
                           job);

  g_object_unref (file);
}

static void
pdf_load_job_start (PdfLoadJob *job)
{
  if (g_str_has_prefix (job->uri, "https://docs.google.com")) {
    pdf_load_job_from_google_documents (job);
  } else {
    pdf_load_job_from_regular_file (job);
  }
}

static void
gd_pdf_loader_dispose (GObject *object)
{
  GdPdfLoader *self = GD_PDF_LOADER (object);

  g_free (self->priv->source_id);

  G_OBJECT_CLASS (gd_pdf_loader_parent_class)->dispose (object);
}

static void
gd_pdf_loader_get_property (GObject *object,
                            guint       prop_id,
                            GValue     *value,
                            GParamSpec *pspec)
{
  GdPdfLoader *self = GD_PDF_LOADER (object);

  switch (prop_id) {
  case PROP_SOURCE_ID:
    g_value_set_string (value, self->priv->source_id);
    break;
  default:
    G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    break;
  }
}

static void
gd_pdf_loader_set_property (GObject *object,
                            guint       prop_id,
                            const GValue *value,
                            GParamSpec *pspec)
{
  GdPdfLoader *self = GD_PDF_LOADER (object);

  switch (prop_id) {
  case PROP_SOURCE_ID:
    self->priv->source_id = g_value_dup_string (value);
    break;
  default:
    G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    break;
  }
}

static void
gd_pdf_loader_class_init (GdPdfLoaderClass *klass)
{
  GObjectClass *oclass;

  oclass = G_OBJECT_CLASS (klass);
  oclass->dispose = gd_pdf_loader_dispose;
  oclass->get_property = gd_pdf_loader_get_property;
  oclass->set_property = gd_pdf_loader_set_property;

  g_object_class_install_property
    (oclass,
     PROP_SOURCE_ID,
     g_param_spec_string ("source-id",
                          "Source ID",
                          "The ID of the source we're loading from",
                          NULL,
                          G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY | G_PARAM_STATIC_STRINGS));

  g_type_class_add_private (klass, sizeof (GdPdfLoaderPrivate));
}

static void
gd_pdf_loader_init (GdPdfLoader *self)
{
  self->priv =
    G_TYPE_INSTANCE_GET_PRIVATE (self,
                                 GD_TYPE_PDF_LOADER,
                                 GdPdfLoaderPrivate);
}

GdPdfLoader *
gd_pdf_loader_new (const gchar *source_id)
{
  return g_object_new (GD_TYPE_PDF_LOADER,
                       "source-id", source_id,
                       NULL);
}

void
gd_pdf_loader_load_uri_async (GdPdfLoader *self,
                              const gchar *uri,
                              GCancellable *cancellable,
                              GAsyncReadyCallback callback,
                              gpointer user_data)
{
  PdfLoadJob *job;
  GSimpleAsyncResult *result;

  result = g_simple_async_result_new (G_OBJECT (self), callback, user_data,
                                      gd_pdf_loader_load_uri_async);

  job = pdf_load_job_new (result, uri, cancellable);

  pdf_load_job_start (job);

  g_object_unref (result);
  g_object_unref (cancellable);
}

/**
 * gd_pdf_loader_load_uri_finish:
 * @self:
 * @res:
 * @error: (allow-none) (out):
 *
 * Returns: (transfer full):
 */
EvDocument *
gd_pdf_loader_load_uri_finish (GdPdfLoader *self,
                               GAsyncResult *res,
                               GError **error)
{
  gpointer r;
  EvDocument *retval;

  if (g_simple_async_result_propagate_error (G_SIMPLE_ASYNC_RESULT (res), error))
    return NULL;

  retval = g_simple_async_result_get_op_res_gpointer (G_SIMPLE_ASYNC_RESULT (res));
  return retval;
}
