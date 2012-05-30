/*
 * Copyright (c) 2012 Red Hat, Inc.
 *
 * Gnome Documents is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Documents is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Debarshi Ray <debarshir@gnome.org>
 *
 */

#include <goa/goa.h>
#include <zpj/zpj.h>
#include <unistd.h>

#include "gd-zpj-miner.h"
#include "gd-miner-tracker.h"
#include "gd-utils.h"

#define MINER_IDENTIFIER "gd:zpj:miner:30058620-777c-47a3-a19c-a6cdf4a315c4"

G_DEFINE_TYPE (GdZpjMiner, gd_zpj_miner, G_TYPE_OBJECT)

struct _GdZpjMinerPrivate {
  GoaClient *client;
  TrackerSparqlConnection *connection;

  GCancellable *cancellable;
  GSimpleAsyncResult *result;

  GList *pending_jobs;
};

static gchar*
_tracker_utils_ensure_contact_resource (TrackerSparqlConnection *connection,
                                        GCancellable *cancellable,
                                        GError **error,
                                        const gchar *graph,
                                        const gchar *fullname)
{
  GString *select, *insert;
  TrackerSparqlCursor *cursor = NULL;
  gchar *retval = NULL;
  gboolean res;
  GVariant *insert_res;
  GVariantIter *iter;
  gchar *key = NULL, *val = NULL;

  select = g_string_new (NULL);
  g_string_append_printf (select,
                          "SELECT ?urn WHERE {"
                          "  GRAPH <%s> {"
                          "    ?urn a nco:Contact ;"
                          "         nco:fullname \"%s\" ."
                          "  }"
                          "}",
                          graph,
                          fullname);

  cursor = tracker_sparql_connection_query (connection,
                                            select->str,
                                            cancellable, error);

  g_string_free (select, TRUE);

  if (*error != NULL)
    goto out;

  res = tracker_sparql_cursor_next (cursor, cancellable, error);

  if (*error != NULL)
    goto out;

  if (res)
    {
      /* return the found resource */
      retval = g_strdup (tracker_sparql_cursor_get_string (cursor, 0, NULL));
      g_debug ("Found resource in the store: %s", retval);
      goto out;
    }

  /* not found, create the resource */
  insert = g_string_new (NULL);

  g_string_append_printf (insert,
                          "INSERT {"
                          "  GRAPH <%s> {"
                          "    _:res a nco:Contact ;"
                          "          nco:fullname \"%s\" ."
                          "  }"
                          "}",
                          graph,
                          fullname);

  insert_res =
    tracker_sparql_connection_update_blank (connection, insert->str,
                                            G_PRIORITY_DEFAULT, cancellable, error);

  g_string_free (insert, TRUE);

  if (*error != NULL)
    goto out;

  /* the result is an "aaa{ss}" variant */
  g_variant_get (insert_res, "aaa{ss}", &iter);
  g_variant_iter_next (iter, "aa{ss}", &iter);
  g_variant_iter_next (iter, "a{ss}", &iter);
  g_variant_iter_next (iter, "{ss}", &key, &val);

  g_variant_iter_free (iter);
  g_variant_unref (insert_res);

  if (g_strcmp0 (key, "res") == 0)
    {
      retval = val;
    }
  else
    {
      g_free (val);
      goto out;
    }

  g_debug ("Created a new contact resource: %s", retval);

 out:
  g_clear_object (&cursor);

  return retval;
}

typedef struct {
  GdZpjMiner *self;
  TrackerSparqlConnection *connection; /* borrowed from GdZpjMiner */
  gulong miner_cancellable_id;

  GoaAccount *account;
  ZpjSkydrive *service;
  GSimpleAsyncResult *async_result;
  GCancellable *cancellable;

  GHashTable *previous_resources;
  gchar *datasource_urn;
} AccountMinerJob;

static void
miner_cancellable_cancelled_cb (GCancellable *cancellable,
                                gpointer user_data)
{
  AccountMinerJob *job = user_data;

  /* forward the cancel signal to the ongoing job */
  g_cancellable_cancel (job->cancellable);
}

static void
account_miner_job_free (AccountMinerJob *job)
{
  if (job->miner_cancellable_id != 0)
    g_cancellable_disconnect (job->self->priv->cancellable,
                              job->miner_cancellable_id);

  g_clear_object (&job->service);
  g_clear_object (&job->self);
  g_clear_object (&job->account);
  g_clear_object (&job->async_result);

  g_hash_table_unref (job->previous_resources);
  g_free (job->datasource_urn);

  g_slice_free (AccountMinerJob, job);
}

static AccountMinerJob *
account_miner_job_new (GdZpjMiner *self,
                       GoaObject *object)
{
  AccountMinerJob *retval;
  ZpjGoaAuthorizer *authorizer;
  GoaAccount *account;

  account = goa_object_get_account (object);
  g_assert (account != NULL);

  retval = g_slice_new0 (AccountMinerJob);
  retval->self = g_object_ref (self);
  retval->cancellable = g_cancellable_new ();
  retval->account = account;
  retval->connection = self->priv->connection;
  retval->previous_resources =
    g_hash_table_new_full (g_str_hash, g_str_equal,
                           (GDestroyNotify) g_free, (GDestroyNotify) g_free);

  if (self->priv->cancellable != NULL)
      retval->miner_cancellable_id =
        g_cancellable_connect (self->priv->cancellable,
                               G_CALLBACK (miner_cancellable_cancelled_cb),
                               retval, NULL);

  authorizer = zpj_goa_authorizer_new (object);
  retval->service = zpj_skydrive_new (ZPJ_AUTHORIZER (authorizer));

  /* the service takes ownership of the authorizer */
  g_object_unref (authorizer);

  retval->datasource_urn = g_strconcat ("gd:goa-account:",
                                        goa_account_get_id (retval->account),
                                        NULL);
  return retval;
}

static void
previous_resources_cleanup_foreach (gpointer key,
                                    gpointer value,
                                    gpointer user_data)
{
  const gchar *resource = value;
  GString *delete = user_data;

  g_string_append_printf (delete, "<%s> a rdfs:Resource . ", resource);
}

static void
account_miner_job_cleanup_previous (AccountMinerJob *job,
                                    GError **error)
{
  GString *delete;

  delete = g_string_new (NULL);
  g_string_append (delete, "DELETE { ");

  /* the resources left here are those who were in the database,
   * but were not found during the query; remove them from the database.
   */
  g_hash_table_foreach (job->previous_resources,
                        previous_resources_cleanup_foreach,
                        delete);

  g_string_append (delete, "}");

  tracker_sparql_connection_update (job->connection,
                                    delete->str,
                                    G_PRIORITY_DEFAULT,
                                    job->cancellable,
                                    error);

  g_string_free (delete, TRUE);
}

static gboolean
account_miner_job_process_entry (AccountMinerJob *job,
                                 ZpjSkydriveEntry *entry,
                                 GError **error)
{
  GDateTime *created_time, *updated_time;
  gchar *contact_resource;
  gchar *resource = NULL;
  gchar *date, *identifier;
  const gchar *class = NULL, *id, *name;

  id = zpj_skydrive_entry_get_id (entry);

  identifier = g_strdup_printf ("%swindows-live:skydrive:%s",
                                ZPJ_IS_SKYDRIVE_FOLDER (entry) ? "gd:collection:" : "",
                                id);

  /* remove from the list of the previous resources */
  g_hash_table_remove (job->previous_resources, identifier);

  name = zpj_skydrive_entry_get_name (entry);

  if (ZPJ_IS_SKYDRIVE_FILE (entry))
    class = gd_filename_to_rdf_type (name);
  else if (ZPJ_IS_SKYDRIVE_FOLDER (entry))
    class = "nfo:DataContainer";

  resource = gd_miner_tracker_sparql_connection_ensure_resource
    (job->connection,
     job->cancellable, error,
     job->datasource_urn, identifier,
     "nfo:RemoteDataObject", class, NULL);

  if (*error != NULL)
    goto out;

  gd_miner_tracker_sparql_connection_set_triple
    (job->connection, job->cancellable, error,
     job->datasource_urn, resource,
     "nie:dataSource", job->datasource_urn);

  if (*error != NULL)
    goto out;

  if (ZPJ_IS_SKYDRIVE_FILE (entry))
    {
      gchar *parent_resource_urn, *parent_identifier;
      const gchar *parent_id, *mime;

      parent_id = zpj_skydrive_entry_get_parent_id (entry);
      parent_identifier = g_strconcat ("gd:collection:windows-live:skydrive:", parent_id, NULL);
      parent_resource_urn = gd_miner_tracker_sparql_connection_ensure_resource
        (job->connection, job->cancellable, error,
         job->datasource_urn, parent_identifier,
         "nfo:RemoteDataObject", "nfo:DataContainer", NULL);
      g_free (parent_identifier);

      if (*error != NULL)
        goto out;

      gd_miner_tracker_sparql_connection_insert_or_replace_triple
        (job->connection,
         job->cancellable, error,
         job->datasource_urn, resource,
         "nie:isPartOf", parent_resource_urn);
      g_free (parent_resource_urn);

      if (*error != NULL)
        goto out;

      mime = gd_filename_to_mime_type (name);
      if (mime != NULL)
        {
          gd_miner_tracker_sparql_connection_insert_or_replace_triple
            (job->connection,
             job->cancellable, error,
             job->datasource_urn, resource,
             "nie:mimeType", mime);

          if (*error != NULL)
            goto out;
        }
    }

  gd_miner_tracker_sparql_connection_insert_or_replace_triple
    (job->connection,
     job->cancellable, error,
     job->datasource_urn, resource,
     "nie:description", zpj_skydrive_entry_get_description (entry));

  if (*error != NULL)
    goto out;

  gd_miner_tracker_sparql_connection_insert_or_replace_triple
    (job->connection,
     job->cancellable, error,
     job->datasource_urn, resource,
     "nfo:fileName", name);

  if (*error != NULL)
    goto out;

  contact_resource = _tracker_utils_ensure_contact_resource
    (job->connection,
     job->cancellable, error,
     job->datasource_urn, zpj_skydrive_entry_get_from_name (entry));

  if (*error != NULL)
    goto out;

  gd_miner_tracker_sparql_connection_insert_or_replace_triple
    (job->connection,
     job->cancellable, error,
     job->datasource_urn, resource,
     "nco:creator", contact_resource);
  g_free (contact_resource);

  if (*error != NULL)
    goto out;

  created_time = zpj_skydrive_entry_get_created_time (entry);
  date = gd_iso8601_from_timestamp (g_date_time_to_unix (created_time));
  gd_miner_tracker_sparql_connection_insert_or_replace_triple
    (job->connection,
     job->cancellable, error,
     job->datasource_urn, resource,
     "nie:contentCreated", date);
  g_free (date);

  if (*error != NULL)
    goto out;

  updated_time = zpj_skydrive_entry_get_updated_time (entry);
  date = gd_iso8601_from_timestamp (g_date_time_to_unix (updated_time));
  gd_miner_tracker_sparql_connection_insert_or_replace_triple
    (job->connection,
     job->cancellable, error,
     job->datasource_urn, resource,
     "nie:contentLastModified", date);
  g_free (date);

  if (*error != NULL)
    goto out;

 out:
  g_free (resource);
  g_free (identifier);

  if (*error != NULL)
    return FALSE;

  return TRUE;
}

static void
account_miner_job_traverse_folder (AccountMinerJob *job,
                                   const gchar *folder_id,
                                   GError **error)
{
  GList *entries, *l;

  entries = zpj_skydrive_list_folder_id (job->service,
                                         folder_id,
                                         job->cancellable,
                                         error);
  if (*error != NULL)
    goto out;

  for (l = entries; l != NULL; l = l->next)
    {
      ZpjSkydriveEntry *entry = (ZpjSkydriveEntry *) l->data;
      const gchar *id;

      id = zpj_skydrive_entry_get_id (entry);

      if (ZPJ_IS_SKYDRIVE_FOLDER (entry))
        {
          account_miner_job_traverse_folder (job, id, error);
          if (*error != NULL)
            goto out;
        }
      else if (ZPJ_IS_SKYDRIVE_PHOTO (entry))
        continue;

      account_miner_job_process_entry (job, entry, error);

      if (*error != NULL)
        {
          g_warning ("Unable to process entry %p: %s", l->data, (*error)->message);
          g_clear_error (error);
        }
    }

 out:
  if (entries != NULL)
    g_list_free_full (entries, g_object_unref);
}

static void
account_miner_job_query_zpj (AccountMinerJob *job,
                             GError **error)
{
  account_miner_job_traverse_folder (job,
                                     ZPJ_SKYDRIVE_FOLDER_SKYDRIVE,
                                     error);
}


static void
account_miner_job_query_existing (AccountMinerJob *job,
                                  GError **error)
{
  GString *select;
  TrackerSparqlCursor *cursor;

  select = g_string_new (NULL);
  g_string_append_printf (select,
                          "SELECT ?urn nao:identifier(?urn) WHERE { ?urn nie:dataSource <gd:goa-account:%s> }",
                          goa_account_get_id (job->account));

  cursor = tracker_sparql_connection_query (job->connection,
                                            select->str,
                                            job->cancellable,
                                            error);
  g_string_free (select, TRUE);

  if (cursor == NULL)
    return;

  while (tracker_sparql_cursor_next (cursor, job->cancellable, error))
    {
      g_hash_table_insert (job->previous_resources,
                           g_strdup (tracker_sparql_cursor_get_string (cursor, 1, NULL)),
                           g_strdup (tracker_sparql_cursor_get_string (cursor, 0, NULL)));
    }

  g_object_unref (cursor);
}

static void
account_miner_job_ensure_datasource (AccountMinerJob *job,
                                     GError **error)
{
  GString *datasource_insert;

  datasource_insert = g_string_new (NULL);
  g_string_append_printf (datasource_insert,
                          "INSERT OR REPLACE INTO <%s> {"
                          "  <%s> a nie:DataSource ; nao:identifier \"%s\""
                          "}",
                          job->datasource_urn,
                          job->datasource_urn,
                          MINER_IDENTIFIER);

  tracker_sparql_connection_update (job->connection,
                                    datasource_insert->str,
                                    G_PRIORITY_DEFAULT,
                                    job->cancellable,
                                    error);

  g_string_free (datasource_insert, TRUE);
}

static gboolean
account_miner_job (GIOSchedulerJob *sched_job,
                   GCancellable *cancellable,
                   gpointer user_data)
{
  AccountMinerJob *job = user_data;
  GError *error = NULL;

  account_miner_job_ensure_datasource (job, &error);

  if (error != NULL)
    goto out;

  account_miner_job_query_existing (job, &error);

  if (error != NULL)
    goto out;

  account_miner_job_query_zpj (job, &error);

  if (error != NULL)
    goto out;

  account_miner_job_cleanup_previous (job, &error);

  if (error != NULL)
    goto out;

 out:
  if (error != NULL)
    g_simple_async_result_take_error (job->async_result, error);

  g_simple_async_result_complete_in_idle (job->async_result);

  return FALSE;
}

static void
account_miner_job_process_async (AccountMinerJob *job,
                                 GAsyncReadyCallback callback,
                                 gpointer user_data)
{
  g_assert (job->async_result == NULL);

  job->async_result = g_simple_async_result_new (NULL, callback, user_data,
                                                 account_miner_job_process_async);
  g_simple_async_result_set_op_res_gpointer (job->async_result, job, NULL);

  g_io_scheduler_push_job (account_miner_job, job, NULL,
                           G_PRIORITY_DEFAULT,
                           job->cancellable);
}

static gboolean
account_miner_job_process_finish (GAsyncResult *res,
                                  GError **error)
{
  GSimpleAsyncResult *simple_res = G_SIMPLE_ASYNC_RESULT (res);

  g_assert (g_simple_async_result_is_valid (res, NULL,
                                            account_miner_job_process_async));

  if (g_simple_async_result_propagate_error (simple_res, error))
    return FALSE;

  return TRUE;
}

static void
gd_zpj_miner_complete_error (GdZpjMiner *self,
                               GError *error)
{
  g_assert (self->priv->result != NULL);

  g_simple_async_result_take_error (self->priv->result, error);
  g_simple_async_result_complete_in_idle (self->priv->result);
}

static void
gd_zpj_miner_check_pending_jobs (GdZpjMiner *self)
{
  if (g_list_length (self->priv->pending_jobs) == 0)
    g_simple_async_result_complete_in_idle (self->priv->result);
}

static void
miner_job_process_ready_cb (GObject *source,
                            GAsyncResult *res,
                            gpointer user_data)
{
  AccountMinerJob *job = user_data;
  GdZpjMiner *self = job->self;
  GError *error = NULL;

  account_miner_job_process_finish (res, &error);

  if (error != NULL)
    {
      g_printerr ("Error while refreshing account %s: %s",
                  goa_account_get_id (job->account), error->message);

      g_error_free (error);
    }

  self->priv->pending_jobs = g_list_remove (self->priv->pending_jobs,
                                            job);
  account_miner_job_free (job);

  gd_zpj_miner_check_pending_jobs (self);
}

static void
gd_zpj_miner_setup_account (GdZpjMiner *self,
                              GoaObject *object)
{
  AccountMinerJob *job;

  job = account_miner_job_new (self, object);
  self->priv->pending_jobs = g_list_prepend (self->priv->pending_jobs, job);

  account_miner_job_process_async (job, miner_job_process_ready_cb, job);
}

typedef struct {
  GdZpjMiner *self;
  GList *doc_objects;
  GList *acc_objects;
  GList *old_datasources;
} CleanupJob;

static gboolean
cleanup_old_accounts_done (gpointer data)
{
  CleanupJob *job = data;
  GList *l;
  GoaObject *object;
  GdZpjMiner *self = job->self;

  /* now setup all the current accounts */
  for (l = job->doc_objects; l != NULL; l = l->next)
    {
      object = l->data;
      gd_zpj_miner_setup_account (self, object);

      g_object_unref (object);
    }

  if (job->doc_objects != NULL)
    {
      g_list_free (job->doc_objects);
      job->doc_objects = NULL;
    }

  if (job->acc_objects != NULL)
    {
      g_list_free_full (job->acc_objects, g_object_unref);
      job->acc_objects = NULL;
    }

  if (job->old_datasources != NULL)
    {
      g_list_free_full (job->old_datasources, g_free);
      job->old_datasources = NULL;
    }

  gd_zpj_miner_check_pending_jobs (self);

  g_clear_object (&job->self);
  g_slice_free (CleanupJob, job);

  return FALSE;
}

static void
cleanup_job_do_cleanup (CleanupJob *job)
{
  GdZpjMiner *self = job->self;
  GList *l;
  GString *update;
  GError *error = NULL;

  if (job->old_datasources == NULL)
    return;

  update = g_string_new (NULL);

  for (l = job->old_datasources; l != NULL; l = l->next)
    {
      const gchar *resource;

      resource = l->data;
      g_debug ("Cleaning up old datasource %s", resource);

      g_string_append_printf (update,
                              "DELETE {"
                              "  ?u a rdfs:Resource"
                              "} WHERE {"
                              "  GRAPH <%s> {"
                              "    ?u a rdfs:Resource"
                              "  }"
                              "}",
                              resource);
    }

  tracker_sparql_connection_update (self->priv->connection,
                                    update->str,
                                    G_PRIORITY_DEFAULT,
                                    self->priv->cancellable,
                                    &error);
  g_string_free (update, TRUE);

  if (error != NULL)
    {
      g_printerr ("Error while cleaning up old accounts: %s\n", error->message);
      g_error_free (error);
    }
}

static gint
cleanup_datasource_compare (gconstpointer a,
                            gconstpointer b)
{
  GoaObject *object = GOA_OBJECT (a);
  const gchar *datasource = b;
  gint res;

  GoaAccount *account;
  gchar *object_datasource;

  account = goa_object_peek_account (object);
  g_assert (account != NULL);

  object_datasource = g_strdup_printf ("gd:goa-account:%s", goa_account_get_id (account));
  res = g_strcmp0 (datasource, object_datasource);

  g_free (object_datasource);

  return res;
}

static gboolean
cleanup_job (GIOSchedulerJob *sched_job,
             GCancellable *cancellable,
             gpointer user_data)
{
  GString *select;
  GError *error = NULL;
  TrackerSparqlCursor *cursor;
  const gchar *datasource;
  GList *element;
  CleanupJob *job = user_data;
  GdZpjMiner *self = job->self;

  /* find all our datasources in the tracker DB */
  select = g_string_new (NULL);
  g_string_append_printf (select, "SELECT ?datasource WHERE { ?datasource a nie:DataSource . "
                          "?datasource nao:identifier \"%s\" }", MINER_IDENTIFIER);

  cursor = tracker_sparql_connection_query (self->priv->connection,
                                            select->str,
                                            self->priv->cancellable,
                                            &error);
  g_string_free (select, TRUE);

  if (error != NULL)
    {
      g_printerr ("Error while cleaning up old accounts: %s\n", error->message);
      goto out;
    }

  while (tracker_sparql_cursor_next (cursor, self->priv->cancellable, NULL))
    {
      /* If the source we found is not in the current list, add
       * it to the cleanup list.
       * Note that the objects here in the list might *not* support
       * documents, in case the switch has been disabled in System Settings.
       * In fact, we only remove all the account data in case the account
       * is really removed from the panel.
       */
      datasource = tracker_sparql_cursor_get_string (cursor, 0, NULL);
      element = g_list_find_custom (job->acc_objects, datasource,
                                    cleanup_datasource_compare);

      if (element == NULL)
        job->old_datasources = g_list_prepend (job->old_datasources,
                                               g_strdup (datasource));
    }

  g_object_unref (cursor);

  /* cleanup the DB */
  cleanup_job_do_cleanup (job);

 out:
  g_io_scheduler_job_send_to_mainloop_async (sched_job,
                                             cleanup_old_accounts_done, job, NULL);
  return FALSE;
}

static void
gd_zpj_miner_cleanup_old_accounts (GdZpjMiner *self,
                                     GList *doc_objects,
                                     GList *acc_objects)
{
  CleanupJob *job = g_slice_new0 (CleanupJob);

  job->self = g_object_ref (self);
  job->doc_objects = doc_objects;
  job->acc_objects = acc_objects;

  g_io_scheduler_push_job (cleanup_job, job, NULL,
                           G_PRIORITY_DEFAULT,
                           self->priv->cancellable);
}

static void
client_ready_cb (GObject *source,
                 GAsyncResult *res,
                 gpointer user_data)
{
  GdZpjMiner *self = user_data;
  GoaDocuments *documents;
  GoaAccount *account;
  GoaObject *object;
  const gchar *provider_type;
  GError *error = NULL;
  GList *accounts, *doc_objects, *acc_objects, *l;

  self->priv->client = goa_client_new_finish (res, &error);

  if (error != NULL)
    {
      gd_zpj_miner_complete_error (self, error);
      return;
    }

  doc_objects = NULL;
  acc_objects = NULL;

  accounts = goa_client_get_accounts (self->priv->client);
  for (l = accounts; l != NULL; l = l->next)
    {
      object = l->data;

      account = goa_object_peek_account (object);
      if (account == NULL)
        continue;

      provider_type = goa_account_get_provider_type (account);
      if (g_strcmp0 (provider_type, "windows_live") != 0)
        continue;

      acc_objects = g_list_append (acc_objects, g_object_ref (object));

      documents = goa_object_peek_documents (object);
      if (documents == NULL)
        continue;

      doc_objects = g_list_append (doc_objects, g_object_ref (object));
    }

  g_list_free_full (accounts, g_object_unref);

  gd_zpj_miner_cleanup_old_accounts (self, doc_objects, acc_objects);
}

static void
sparql_connection_ready_cb (GObject *object,
                            GAsyncResult *res,
                            gpointer user_data)
{
  GError *error = NULL;
  GdZpjMiner *self = user_data;

  self->priv->connection = tracker_sparql_connection_get_finish (res, &error);

  if (error != NULL)
    {
      gd_zpj_miner_complete_error (self, error);
      return;
    }

  goa_client_new (self->priv->cancellable, client_ready_cb, self);
}

static void
gd_zpj_miner_dispose (GObject *object)
{
  GdZpjMiner *self = GD_ZPJ_MINER (object);

  if (self->priv->pending_jobs != NULL)
    {
      g_list_free_full (self->priv->pending_jobs,
                        (GDestroyNotify) account_miner_job_free);
      self->priv->pending_jobs = NULL;
    }

  g_clear_object (&self->priv->client);
  g_clear_object (&self->priv->connection);
  g_clear_object (&self->priv->cancellable);
  g_clear_object (&self->priv->result);

  G_OBJECT_CLASS (gd_zpj_miner_parent_class)->dispose (object);
}

static void
gd_zpj_miner_init (GdZpjMiner *self)
{
  self->priv =
    G_TYPE_INSTANCE_GET_PRIVATE (self, GD_TYPE_ZPJ_MINER, GdZpjMinerPrivate);
}

static void
gd_zpj_miner_class_init (GdZpjMinerClass *klass)
{
  GObjectClass *oclass = G_OBJECT_CLASS (klass);

  oclass->dispose = gd_zpj_miner_dispose;

  g_type_class_add_private (klass, sizeof (GdZpjMinerPrivate));
}

GdZpjMiner *
gd_zpj_miner_new (void)
{
  return g_object_new (GD_TYPE_ZPJ_MINER, NULL);
}

void
gd_zpj_miner_refresh_db_async (GdZpjMiner *self,
                               GCancellable *cancellable,
                               GAsyncReadyCallback callback,
                               gpointer user_data)
{
  self->priv->result =
    g_simple_async_result_new (G_OBJECT (self),
                               callback, user_data,
                               gd_zpj_miner_refresh_db_async);
  self->priv->cancellable =
    (cancellable != NULL) ? g_object_ref (cancellable) : NULL;

  tracker_sparql_connection_get_async (self->priv->cancellable,
                                       sparql_connection_ready_cb, self);
}

gboolean
gd_zpj_miner_refresh_db_finish (GdZpjMiner *self,
                                GAsyncResult *res,
                                GError **error)
{
  GSimpleAsyncResult *simple_res = G_SIMPLE_ASYNC_RESULT (res);

  g_assert (g_simple_async_result_is_valid (res, G_OBJECT (self),
                                            gd_zpj_miner_refresh_db_async));

  if (g_simple_async_result_propagate_error (simple_res, error))
    return FALSE;

  return TRUE;
}
