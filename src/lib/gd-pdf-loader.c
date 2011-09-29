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
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Authors: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

#include "gd-pdf-loader.h"

#include "gd-gdata-goa-authorizer.h"

#include <string.h>
#include <gdata/gdata.h>
#include <evince-document.h>
#include <evince-view.h>
#include <glib/gstdio.h>

typedef struct {
  GSimpleAsyncResult *result;
  GCancellable *cancellable;

  EvDocument *document;
  gchar *uri;
  gchar *pdf_path;
  GPid unoconv_pid;

  GDataDownloadStream *stream;
  GDataEntry *gdata_entry;
  GDataService *gdata_service;
  gchar *document_id;

  guint64 pdf_cache_mtime;
  guint64 original_file_mtime;

  gboolean unlink_cache;
} PdfLoadJob;

/* --------------------------- utils -------------------------------- */

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
  g_clear_object (&job->gdata_service);
  g_clear_object (&job->gdata_entry);

  g_free (job->uri);
  g_free (job->document_id);

  if (job->pdf_path != NULL) {
    if (job->unlink_cache)
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
                  GDataEntry *entry,
                  GCancellable *cancellable)
{
  PdfLoadJob *retval;

  retval = g_slice_new0 (PdfLoadJob);
  retval->result = g_object_ref (result);
  retval->cancellable = g_object_ref (cancellable);
  retval->unoconv_pid = -1;
  retval->unlink_cache = FALSE;

  if (uri != NULL)
    retval->uri = g_strdup (uri);
  if (entry != NULL)
    retval->gdata_entry = g_object_ref (entry);

  return retval;
}

static void
pdf_load_job_complete_error (PdfLoadJob *job,
                             GError *error)
{
    g_simple_async_result_take_error (job->result, error);
    g_simple_async_result_complete_in_idle (job->result);

    job->unlink_cache = TRUE;
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
cache_set_attributes_ready_cb (GObject *source,
                               GAsyncResult *res,
                               gpointer user_data)
{
  PdfLoadJob *job = user_data;
  GError *error = NULL;
  GFileInfo *out_info = NULL;

  g_file_set_attributes_finish (G_FILE (source), res, &out_info, &error);

  if (error != NULL) {
    /* just emit a warning here; setting the mtime is a precaution
     * against the cache file being externally modified after it has been
     * created, which is unlikely. Invalidate the cache immediately after
     * loading the file in this case.
     */
    job->unlink_cache = TRUE;

    g_warning ("Cannot set mtime on the cache file; cache will not be valid "
               "after the file has been viewed. Error: %s", error->message);
    g_error_free (error);
  }

  if (out_info != NULL)
    g_object_unref (out_info);

  pdf_load_job_from_pdf (job);
}

static void
pdf_load_job_cache_set_attributes (PdfLoadJob *job)
{
  GFileInfo *info;
  GFile *file;

  /* make the file private */
  g_chmod (job->pdf_path, 0600);

  file = g_file_new_for_path (job->pdf_path);
  info = g_file_info_new ();

  g_file_info_set_attribute_uint64 (info, G_FILE_ATTRIBUTE_TIME_MODIFIED,
                                    job->original_file_mtime);
  g_file_set_attributes_async (file, info,
                               G_FILE_QUERY_INFO_NONE,
                               G_PRIORITY_DEFAULT,
                               job->cancellable,
                               cache_set_attributes_ready_cb,
                               job);

  g_object_unref (info);
  g_object_unref (file);
}

static void
os_splice_ready_cb (GObject *source,
                    GAsyncResult *res,
                    gpointer user_data)
{
  GError *error = NULL;
  PdfLoadJob *job = user_data;

  g_output_stream_splice_finish (G_OUTPUT_STREAM (source), res, &error);

  if (error != NULL) {
    pdf_load_job_complete_error (job, error);
    return;
  }

  pdf_load_job_cache_set_attributes (job);
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
pdf_load_job_gdata_refresh_cache (PdfLoadJob *job)
{
  GDataDownloadStream *stream;
  GError *error = NULL;
  GFile *pdf_file;

  stream = gdata_documents_document_download (GDATA_DOCUMENTS_DOCUMENT (job->gdata_entry),
                                              GDATA_DOCUMENTS_SERVICE (job->gdata_service),
                                              "pdf", job->cancellable, &error);

  if (error != NULL) {
    pdf_load_job_complete_error (job, error);
    return;
  }

  job->stream = stream;
  pdf_file = g_file_new_for_path (job->pdf_path);

  g_file_replace_async (pdf_file, NULL, FALSE,
                        G_FILE_CREATE_PRIVATE,
                        G_PRIORITY_DEFAULT,
                        job->cancellable, file_replace_ready_cb,
                        job);

  g_object_unref (pdf_file);
}

static void
gdata_cache_query_info_ready_cb (GObject *source,
                                 GAsyncResult *res,
                                 gpointer user_data)
{
  PdfLoadJob *job = user_data;
  GError *error = NULL;
  GFileInfo *info;
  guint64 cache_mtime;

  info = g_file_query_info_finish (G_FILE (source), res, &error);

  if (error != NULL) {
    /* create/invalidate cache */
    pdf_load_job_gdata_refresh_cache (job);
    g_error_free (error);

    return;
  }

  job->pdf_cache_mtime = cache_mtime = 
    g_file_info_get_attribute_uint64 (info, G_FILE_ATTRIBUTE_TIME_MODIFIED);
  g_object_unref (info);

  if (job->original_file_mtime > cache_mtime)
    pdf_load_job_gdata_refresh_cache (job);
  else
    /* load the cached file */
    pdf_load_job_from_pdf (job);
}

static void
pdf_load_job_from_google_documents (PdfLoadJob *job)
{
  gchar *tmp_name;
  gchar *tmp_path, *pdf_path;
  GFile *pdf_file;

  job->original_file_mtime = gdata_entry_get_updated (job->gdata_entry);

  tmp_name = g_strdup_printf ("gnome-documents-%u.pdf", 
                              g_str_hash (gdata_documents_entry_get_document_id (GDATA_DOCUMENTS_ENTRY (job->gdata_entry))));
  tmp_path = g_build_filename (g_get_user_cache_dir (), "gnome-documents", NULL);
  job->pdf_path = pdf_path =
    g_build_filename (tmp_path, tmp_name, NULL);
  g_mkdir_with_parents (tmp_path, 0700);

  pdf_file = g_file_new_for_path (pdf_path);

  g_file_query_info_async (pdf_file,
                           G_FILE_ATTRIBUTE_TIME_MODIFIED,
                           G_FILE_QUERY_INFO_NONE,
                           G_PRIORITY_DEFAULT,
                           job->cancellable,
                           gdata_cache_query_info_ready_cb,
                           job);

  g_free (tmp_name);
  g_free (tmp_path);
  g_object_unref (pdf_file);
}

static void
pdf_load_job_from_gdata_cache (PdfLoadJob *job)
{
  gchar *tmp_name;
  gchar *tmp_path;

  tmp_name = g_strdup_printf ("gnome-documents-%u.pdf", 
                              g_str_hash (job->document_id));
  tmp_path = g_build_filename (g_get_user_cache_dir (), "gnome-documents", NULL);
  job->pdf_path = g_build_filename (tmp_path, tmp_name, NULL);

  pdf_load_job_from_pdf (job);

  g_free (tmp_path);
  g_free (tmp_name);
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

  pdf_load_job_cache_set_attributes (job);
}

static void
pdf_load_job_openoffice_refresh_cache (PdfLoadJob *job)
{
  gchar *doc_path, *cmd, *quoted_path;
  GFile *file;
  gint argc;
  GPid pid;
  gchar **argv = NULL;
  GError *error = NULL;

  /* build the temporary PDF file path */
  file = g_file_new_for_uri (job->uri);
  doc_path = g_file_get_path (file);
  quoted_path = g_shell_quote (doc_path);

  g_object_unref (file);
  g_free (doc_path);

  /* call into the unoconv executable to convert the OpenOffice document
   * to the temporary PDF.
   */
  cmd = g_strdup_printf ("unoconv -f pdf -o %s %s", job->pdf_path, quoted_path);
  g_shell_parse_argv (cmd, &argc, &argv, &error);

  g_free (cmd);
  g_free (quoted_path);

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
openoffice_cache_query_info_original_ready_cb (GObject *source,
                                               GAsyncResult *res,
                                               gpointer user_data)
{
  PdfLoadJob *job = user_data;
  GError *error = NULL;
  GFileInfo *info;
  guint64 mtime;

  info = g_file_query_info_finish (G_FILE (source), res, &error);

  if (error != NULL) {
    /* try to create the cache anyway - if the source file
     * is really not readable we'll fail again soon.
     */
    pdf_load_job_openoffice_refresh_cache (job);

    g_error_free (error);
    return;
  }

  job->original_file_mtime = mtime = 
    g_file_info_get_attribute_uint64 (info, G_FILE_ATTRIBUTE_TIME_MODIFIED);
  g_object_unref (info);

  if (mtime > job->pdf_cache_mtime)
    pdf_load_job_openoffice_refresh_cache (job);
  else
    /* load the cached file */
    pdf_load_job_from_pdf (job);
}

static void
openoffice_cache_query_info_ready_cb (GObject *source,
                                      GAsyncResult *res,
                                      gpointer user_data)
{
  PdfLoadJob *job = user_data;
  GError *error = NULL;
  GFileInfo *info;
  GFile *original_file;

  info = g_file_query_info_finish (G_FILE (source), res, &error);

  if (error != NULL) {
    /* create/invalidate cache */
    pdf_load_job_openoffice_refresh_cache (job);

    g_error_free (error);
    return;
  }

  job->pdf_cache_mtime = 
    g_file_info_get_attribute_uint64 (info, 
                                      G_FILE_ATTRIBUTE_TIME_MODIFIED);

  original_file = g_file_new_for_uri (job->uri);
  g_file_query_info_async (original_file,
                           G_FILE_ATTRIBUTE_TIME_MODIFIED,
                           G_FILE_QUERY_INFO_NONE,
                           G_PRIORITY_DEFAULT,
                           job->cancellable,
                           openoffice_cache_query_info_original_ready_cb,
                           job);

  g_object_unref (original_file);
  g_object_unref (info);
}

static void
pdf_load_job_from_openoffice (PdfLoadJob *job)
{
  gchar *pdf_path, *tmp_name, *tmp_path;
  GFile *cache_file;

  tmp_name = g_strdup_printf ("gnome-documents-%u.pdf", g_str_hash (job->uri));
  tmp_path = g_build_filename (g_get_user_cache_dir (), "gnome-documents", NULL);
  job->pdf_path = pdf_path =
    g_build_filename (tmp_path, tmp_name, NULL);

  g_mkdir_with_parents (tmp_path, 0700);

  cache_file = g_file_new_for_path (pdf_path);
  g_file_query_info_async (cache_file,
                           G_FILE_ATTRIBUTE_TIME_MODIFIED,
                           G_FILE_QUERY_INFO_NONE,
                           G_PRIORITY_DEFAULT,
                           job->cancellable,
                           openoffice_cache_query_info_ready_cb,
                           job);

  g_free (tmp_name);
  g_free (tmp_path);
  g_object_unref (cache_file);
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

static gchar *
document_id_from_entry_id (const gchar *entry_id)
{
  const gchar *ptr;

  ptr = g_strrstr (entry_id, "%3A");

  if (ptr)
    return g_strdup (ptr + 3);

  return g_strdup (entry_id);
}

static void
pdf_load_job_from_regular_file (PdfLoadJob *job)
{
  GFile *file;

  if (g_str_has_prefix (job->uri, "https://docs.google.com")) {
    job->document_id = document_id_from_entry_id (job->uri);
    pdf_load_job_from_gdata_cache (job);
    return;
  }

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
  if (job->gdata_entry != NULL)
    pdf_load_job_from_google_documents (job);
  else
    pdf_load_job_from_regular_file (job);
}

void
gd_pdf_loader_load_uri_async (const gchar *uri,
                              GCancellable *cancellable,
                              GAsyncReadyCallback callback,
                              gpointer user_data)
{
  PdfLoadJob *job;
  GSimpleAsyncResult *result;

  result = g_simple_async_result_new (NULL, callback, user_data,
                                      gd_pdf_loader_load_uri_async);

  job = pdf_load_job_new (result, uri, NULL, cancellable);

  pdf_load_job_start (job);

  g_object_unref (result);
}

/**
 * gd_pdf_loader_load_uri_finish:
 * @res:
 * @error: (allow-none) (out):
 *
 * Returns: (transfer full):
 */
EvDocument *
gd_pdf_loader_load_uri_finish (GAsyncResult *res,
                               GError **error)
{
  EvDocument *retval;

  if (g_simple_async_result_propagate_error (G_SIMPLE_ASYNC_RESULT (res), error))
    return NULL;

  retval = g_simple_async_result_get_op_res_gpointer (G_SIMPLE_ASYNC_RESULT (res));
  return retval;
}


void
gd_pdf_loader_load_entry_async (GDataEntry *entry,
                                GDataDocumentsService *service,
                                GCancellable *cancellable,
                                GAsyncReadyCallback callback,
                                gpointer user_data)
{
  PdfLoadJob *job;
  GSimpleAsyncResult *result;

  result = g_simple_async_result_new (NULL, callback, user_data,
                                      gd_pdf_loader_load_entry_async);

  job = pdf_load_job_new (result, NULL, entry, cancellable);
  job->gdata_service = g_object_ref (service);

  pdf_load_job_start (job);

  g_object_unref (result);
}

/**
 * gd_pdf_loader_load_entry_finish:
 * @res:
 * @error: (allow-none) (out):
 *
 * Returns: (transfer full):
 */
EvDocument *
gd_pdf_loader_load_entry_finish (GAsyncResult *res,
                                 GError **error)
{
  EvDocument *retval;

  if (g_simple_async_result_propagate_error (G_SIMPLE_ASYNC_RESULT (res), error))
    return NULL;

  retval = g_simple_async_result_get_op_res_gpointer (G_SIMPLE_ASYNC_RESULT (res));
  return retval;
}
