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
 * - error forwarding to the caller, don't die silently
 * - possibly better to turn the loader into an explicit
 *   _load() API passing a GCancellable, so we can control it
 *   from the application too
 * - investigate the GDataDocumentsType bug
 */

G_DEFINE_TYPE (GdPdfLoader, gd_pdf_loader, G_TYPE_OBJECT);

enum {
  PROP_DOCUMENT = 1,
  PROP_URI,
  PROP_SOURCE_ID
};

struct _GdPdfLoaderPrivate {
  EvDocument *document;
  gchar *uri;
  gchar *pdf_path;
  gchar *source_id;

  GPid unoconv_pid;
  GDataDownloadStream *stream;
};

static void
load_job_done (EvJob *job,
               gpointer user_data)
{
  GdPdfLoader *self = user_data;

  if (ev_job_is_failed (job)) {
    g_print ("Failed to load document: %s", job->error->message);
    g_object_unref (job);

    return;
  }

  self->priv->document = g_object_ref (job->document);
  g_object_unref (job);

  g_object_notify (G_OBJECT (self), "document");
}

static void
load_pdf (GdPdfLoader *self,
          const gchar *uri)
{
  EvJob *job;

  job = ev_job_load_new (uri);
  g_signal_connect (job, "finished",
                    G_CALLBACK (load_job_done), self);

  ev_job_scheduler_push_job (job, EV_JOB_PRIORITY_NONE);
}

#define GOA_DOCS_TRACKER_PREFIX "goa:documents:"

static gchar *
strip_tracker_prefix (const gchar *source_id)
{
  if (g_str_has_prefix (source_id, GOA_DOCS_TRACKER_PREFIX))
    return g_strdup (source_id + strlen (GOA_DOCS_TRACKER_PREFIX));

  return NULL;
}

static void
os_splice_ready_cb (GObject *source,
                    GAsyncResult *res,
                    gpointer user_data)
{
  GdPdfLoader *self = user_data;
  GError *error = NULL;
  GFile *file;
  gchar *uri;

  g_output_stream_splice_finish (G_OUTPUT_STREAM (source), res, &error);

  if (error != NULL) {
    g_warning ("Unable to download the PDF file from google: %s\n", error->message);
    g_error_free (error);
    return;
  }

  file = g_file_new_for_path (self->priv->pdf_path);
  uri = g_file_get_uri (file);
  load_pdf (self, uri);

  g_object_unref (file);
  g_free (uri);
}

static void
file_replace_ready_cb (GObject *source,
                       GAsyncResult *res,
                       gpointer user_data)
{
  GFileOutputStream *os;
  GError *error = NULL;
  GdPdfLoader *self = user_data;

  os = g_file_replace_finish (G_FILE (source), res, &error);

  if (error != NULL) {
    g_warning ("Unable to open the temp file for writing: %s\n", error->message);
    g_error_free (error);
    return;
  }

  g_output_stream_splice_async (G_OUTPUT_STREAM (os),
                                G_INPUT_STREAM (self->priv->stream),
                                G_OUTPUT_STREAM_SPLICE_CLOSE_SOURCE |
                                G_OUTPUT_STREAM_SPLICE_CLOSE_TARGET,
                                G_PRIORITY_DEFAULT,
                                NULL,
                                os_splice_ready_cb, self);

  g_object_unref (os);
}

static void
single_entry_ready_cb (GObject *source,
                       GAsyncResult *res,
                       gpointer user_data)
{
  GDataEntry *entry;
  GdPdfLoader *self = user_data;
  GDataDownloadStream *stream;
  GError *error = NULL;
  gchar *tmp_name;
  gchar *tmp_path, *pdf_path;
  GFile *pdf_file;

  entry = gdata_service_query_single_entry_finish (GDATA_SERVICE (source), res, &error);

  if (error != NULL) {
    g_warning ("Unable to query the requested entry from GData: %s\n", error->message);
    g_error_free (error);
    return;
  }

  stream = gdata_documents_document_download (GDATA_DOCUMENTS_DOCUMENT (entry),
                                              GDATA_DOCUMENTS_SERVICE (source),
                                              "pdf", NULL, &error);

  if (error != NULL) {
    g_warning ("Unable to get the download stream for the requested document from GData: %s\n", error->message);
    g_error_free (error);
    return;
  }

  self->priv->stream = stream;

  tmp_name = g_strdup_printf ("gnome-documents-%d.pdf", getpid ());
  tmp_path = g_build_filename (g_get_user_cache_dir (), "gnome-documents", NULL);
  self->priv->pdf_path = pdf_path =
    g_build_filename (tmp_path, tmp_name, NULL);
  g_mkdir_with_parents (tmp_path, 0700);

  pdf_file = g_file_new_for_path (pdf_path);
  g_file_replace_async (pdf_file, NULL, FALSE,
                        G_FILE_CREATE_PRIVATE,
                        G_PRIORITY_DEFAULT,
                        NULL, file_replace_ready_cb,
                        self);

  g_free (tmp_name);
  g_free (tmp_path);
  g_object_unref (pdf_file);
  g_object_unref (entry);
}

static void
load_from_google_documents_with_object (GdPdfLoader *self,
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
                                          self->priv->uri,
                                          NULL, GDATA_TYPE_DOCUMENTS_TEXT,
                                          NULL, single_entry_ready_cb, self);

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
  GdPdfLoader *self = user_data;

  client = goa_client_new_finish (res, &error);

  if (error != NULL) {
    g_warning ("Error while getting the GOA client: %s",
               error->message);
    g_error_free (error);

    return;
  }

  stripped_id = strip_tracker_prefix (self->priv->source_id);

  if (stripped_id == NULL) {
    g_warning ("Wrong source ID; passed in a google URL, but the source ID is not coming from GOA");
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

  if (target != NULL)
    load_from_google_documents_with_object (self, target);

  g_free (stripped_id);
  g_list_free_full (accounts, g_object_unref);
  g_object_unref (client);
}

static void
load_from_google_documents (GdPdfLoader *self)
{
  goa_client_new (NULL, client_ready_cb, self);
}

static void
unoconv_child_watch_cb (GPid pid,
                        gint status,
                        gpointer user_data)
{
  GdPdfLoader *self = user_data;
  GFile *file;
  gchar *uri;

  g_spawn_close_pid (pid);
  self->priv->unoconv_pid = -1;

  file = g_file_new_for_path (self->priv->pdf_path);
  uri = g_file_get_uri (file);
  load_pdf (self, uri);

  g_object_unref (file);
  g_free (uri);
}

static void
load_openoffice (GdPdfLoader *self)
{
  gchar *doc_path, *pdf_path, *tmp_name, *tmp_path;
  GFile *file;
  gboolean res;
  gchar *cmd;

  gint argc;
  GPid pid;
  gchar **argv = NULL;
  GError *error = NULL;

  file = g_file_new_for_uri (self->priv->uri);
  doc_path = g_file_get_path (file);
  g_object_unref (file);

  tmp_name = g_strdup_printf ("gnome-documents-%d.pdf", getpid ());
  tmp_path = g_build_filename (g_get_user_cache_dir (), "gnome-documents", NULL);
  self->priv->pdf_path = pdf_path =
    g_build_filename (tmp_path, tmp_name, NULL);
  g_mkdir_with_parents (tmp_path, 0700);

  cmd = g_strdup_printf ("unoconv -f pdf -o %s %s", pdf_path, doc_path);

  g_free (doc_path);
  g_free (tmp_name);
  g_free (tmp_path);

  res = g_shell_parse_argv (cmd, &argc, &argv, &error);
  g_free (cmd);

  if (!res) {
    g_warning ("Error while parsing the unoconv command line: %s",
               error->message);
    g_error_free (error);

    return;
  }

  res = g_spawn_async (NULL, argv, NULL,
                       G_SPAWN_DO_NOT_REAP_CHILD |
                       G_SPAWN_SEARCH_PATH,
                       NULL, NULL,
                       &pid, &error);

  g_strfreev (argv);

  if (!res) {
    g_warning ("Error while spawning unoconv: %s",
               error->message);
    g_error_free (error);

    return;
  }

  g_child_watch_add (pid, unoconv_child_watch_cb, self);
  self->priv->unoconv_pid = pid;
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

static void
query_info_ready_cb (GObject *obj,
                     GAsyncResult *res,
                     gpointer user_data)
{
  GdPdfLoader *self = user_data;
  GError *error = NULL;
  GFileInfo *info;
  const gchar *content_type;

  info = g_file_query_info_finish (G_FILE (obj),
                                   res, &error);

  if (error != NULL) {
    g_warning ("Unable to query the mimetype of %s: %s",
               self->priv->uri, error->message);
    g_error_free (error);

    return;
  }

  content_type = g_file_info_get_content_type (info);
  g_object_unref (info);

  if (content_type_is_native (content_type))
    load_pdf (self, self->priv->uri);
  else
    load_openoffice (self);
}

static void
start_loading_document (GdPdfLoader *self)
{
  GFile *file;

  if (g_str_has_prefix (self->priv->uri, "https://docs.google.com")) {
    load_from_google_documents (self);
    return;
  }

  file = g_file_new_for_uri (self->priv->uri);
  g_file_query_info_async (file,
                           G_FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE,
                           G_FILE_QUERY_INFO_NONE,
                           G_PRIORITY_DEFAULT,
                           NULL,
                           query_info_ready_cb,
                           self);

  g_object_unref (file);
}

static void
gd_pdf_loader_set_uri (GdPdfLoader *self,
                       const gchar *uri)
{
  g_clear_object (&self->priv->document);
  g_free (self->priv->uri);

  self->priv->uri = g_strdup (uri);
  start_loading_document (self);
}

void
gd_pdf_loader_cleanup_document (GdPdfLoader *self)
{
  if (self->priv->pdf_path) {
    g_unlink (self->priv->pdf_path);
    g_free (self->priv->pdf_path);
  }

  if (self->priv->unoconv_pid != -1) {
    kill (self->priv->unoconv_pid, SIGKILL);
    self->priv->unoconv_pid = -1;
  }
}

static void
gd_pdf_loader_dispose (GObject *object)
{
  GdPdfLoader *self = GD_PDF_LOADER (object);

  gd_pdf_loader_cleanup_document (self);

  g_clear_object (&self->priv->document);
  g_clear_object (&self->priv->stream);
  g_free (self->priv->uri);
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
  case PROP_DOCUMENT:
    g_value_set_object (value, self->priv->document);
    break;
  case PROP_URI:
    g_value_set_string (value, self->priv->uri);
    break;
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
  case PROP_URI:
    gd_pdf_loader_set_uri (self, g_value_get_string (value));
    break;
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
     PROP_DOCUMENT,
     g_param_spec_object ("document",
                          "Document",
                          "The loaded document",
                          EV_TYPE_DOCUMENT,
                          G_PARAM_READABLE));

  g_object_class_install_property
    (oclass,
     PROP_URI,
     g_param_spec_string ("uri",
                          "URI",
                          "The URI to load",
                          NULL,
                          G_PARAM_READWRITE));

  g_object_class_install_property
    (oclass,
     PROP_SOURCE_ID,
     g_param_spec_string ("source-id",
                          "Source ID",
                          "The ID of the source we're loading from",
                          NULL,
                          G_PARAM_READWRITE));

  g_type_class_add_private (klass, sizeof (GdPdfLoaderPrivate));
}

static void
gd_pdf_loader_init (GdPdfLoader *self)
{
  self->priv =
    G_TYPE_INSTANCE_GET_PRIVATE (self,
                                 GD_TYPE_PDF_LOADER,
                                 GdPdfLoaderPrivate);
  self->priv->unoconv_pid = -1;
}

GdPdfLoader *
gd_pdf_loader_new (const gchar *uri)
{
  return g_object_new (GD_TYPE_PDF_LOADER,
                       "uri", uri,
                       NULL);
}
