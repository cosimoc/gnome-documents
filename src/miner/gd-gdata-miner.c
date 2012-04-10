/*
 * Copyright (c) 2011 Red Hat, Inc.
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
 * Author: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

#include <gdata/gdata.h>
#include <goa/goa.h>
#include <unistd.h>

#include "gd-gdata-goa-authorizer.h"
#include "gd-gdata-miner.h"
#include "gd-utils.h"

#define MINER_IDENTIFIER "gd:gdata:miner:86ec9bc9-c242-427f-aa19-77b5a2c9b6f0"
#define STARRED_CATEGORY_TERM "http://schemas.google.com/g/2005/labels#starred"
#define PARENT_LINK_REL "http://schemas.google.com/docs/2007#parent"

G_DEFINE_TYPE (GdGDataMiner, gd_gdata_miner, G_TYPE_OBJECT)

struct _GdGDataMinerPrivate {
  GoaClient *client;
  TrackerSparqlConnection *connection;

  GCancellable *cancellable;
  GSimpleAsyncResult *result;

  GList *pending_jobs;
};

static gchar *
_tracker_utils_format_into_graph (const gchar *graph)
{
  return (graph != NULL) ? g_strdup_printf ("INTO <%s> ", graph) : g_strdup ("");
}

static gboolean
_tracker_sparql_connection_toggle_favorite (TrackerSparqlConnection *connection,
                                            GCancellable *cancellable,
                                            GError **error,
                                            const gchar *resource,
                                            gboolean favorite)
{
  GString *update;
  const gchar *op_str = NULL;
  gboolean retval = TRUE;

  if (favorite)
    op_str = "INSERT OR REPLACE";
  else
    op_str = "DELETE";

  update = g_string_new (NULL);
  g_string_append_printf 
    (update,
     "%s { <%s> nao:hasTag nao:predefined-tag-favorite }",
     op_str, resource);

  g_debug ("Toggle favorite: query %s", update->str);

  tracker_sparql_connection_update (connection, update->str, 
                                    G_PRIORITY_DEFAULT, cancellable,
                                    error);

  g_string_free (update, TRUE);

  if (*error != NULL)
    retval = FALSE;

  return retval;
}

static gboolean
_tracker_sparql_connection_insert_or_replace_triple (TrackerSparqlConnection *connection,
                                                     GCancellable *cancellable,
                                                     GError **error,
                                                     const gchar *graph,
                                                     const gchar *resource,
                                                     const gchar *property_name,
                                                     const gchar *property_value)
{
  GString *insert;
  gchar *graph_str;
  gboolean retval = TRUE;

  graph_str = _tracker_utils_format_into_graph (graph);

  insert = g_string_new (NULL);
  g_string_append_printf 
    (insert,
     "INSERT OR REPLACE %s { <%s> a nie:InformationElement ; %s \"%s\" }",
     graph_str, resource, property_name, property_value);

  g_debug ("Insert or replace triple: query %s", insert->str);

  tracker_sparql_connection_update (connection, insert->str, 
                                    G_PRIORITY_DEFAULT, cancellable,
                                    error);

  g_string_free (insert, TRUE);

  if (*error != NULL)
    retval = FALSE;

  g_free (graph_str);

  return retval;
}

static gboolean
_tracker_sparql_connection_set_triple (TrackerSparqlConnection *connection,
                                       GCancellable *cancellable,
                                       GError **error,
                                       const gchar *graph,
                                       const gchar *resource,
                                       const gchar *property_name,
                                       const gchar *property_value)
{
  GString *delete;
  gboolean retval = TRUE;

  delete = g_string_new (NULL);
  g_string_append_printf 
    (delete,
     "DELETE { <%s> %s ?val } WHERE { <%s> %s ?val }", resource,
     property_name, resource, property_name);

  tracker_sparql_connection_update (connection, delete->str, 
                                    G_PRIORITY_DEFAULT, cancellable,
                                    error);

  g_string_free (delete, TRUE);
  if (*error != NULL)
    {
      retval = FALSE;
      goto out;
    }

  retval = 
    _tracker_sparql_connection_insert_or_replace_triple (connection, 
                                                         cancellable, error,
                                                         graph, resource,
                                                         property_name, property_value);

 out:
  return retval;
}

static gchar*
_tracker_utils_ensure_contact_resource (TrackerSparqlConnection *connection,
                                        GCancellable *cancellable,
                                        GError **error,
                                        const gchar *email,
                                        const gchar *fullname)
{
  GString *select, *insert;
  TrackerSparqlCursor *cursor = NULL;
  gchar *retval = NULL, *mail_uri = NULL;
  gboolean res;
  GVariant *insert_res;
  GVariantIter *iter;
  gchar *key = NULL, *val = NULL;

  mail_uri = g_strconcat ("mailto:", email, NULL);
  select = g_string_new (NULL);
  g_string_append_printf (select, 
                          "SELECT ?urn WHERE { ?urn a nco:Contact . "
                          "?urn nco:hasEmailAddress ?mail . "
                          "FILTER (fn:contains(?mail, \"%s\" )) }", mail_uri);

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
                          "INSERT { <%s> a nco:EmailAddress ; nco:emailAddress \"%s\" . "
                          "_:res a nco:Contact ; nco:hasEmailAddress <%s> ; nco:fullname \"%s\" . }",
                          mail_uri, email,
                          mail_uri, fullname);

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
  g_free (mail_uri);

  return retval;
}

static gchar*
_tracker_sparql_connection_ensure_resource (TrackerSparqlConnection *connection,
                                            GCancellable *cancellable,
                                            GError **error,
                                            const gchar *graph,
                                            const gchar *identifier,
                                            const gchar *class,
                                            ...)
{
  GString *select, *insert, *inner;
  va_list args;
  const gchar *arg;
  TrackerSparqlCursor *cursor;
  gboolean res;
  gchar *retval = NULL;
  gchar *graph_str;
  GVariant *insert_res;
  GVariantIter *iter;
  gchar *key = NULL, *val = NULL;

  /* build the inner query with all the classes */
  va_start (args, class);
  inner = g_string_new (NULL);

  for (arg = class; arg != NULL; arg = va_arg (args, const gchar *))
    g_string_append_printf (inner, " a %s; ", arg);

  g_string_append_printf (inner, "nao:identifier \"%s\"", identifier);

  va_end (args);

  /* query if such a resource is already in the DB */
  select = g_string_new (NULL);
  g_string_append_printf (select, 
                          "SELECT ?urn WHERE { ?urn %s }", inner->str);

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
  graph_str = _tracker_utils_format_into_graph (graph);

  g_string_append_printf (insert, "INSERT %s { _:res %s }", 
                          graph_str, inner->str);
  g_free (graph_str);
  g_string_free (inner, TRUE);

  insert_res = 
    tracker_sparql_connection_update_blank (connection, insert->str,
                                            G_PRIORITY_DEFAULT, NULL, error);

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

  g_debug ("Created a new resource: %s", retval);

 out:
  g_clear_object (&cursor);
  return retval;
}

typedef struct {
  GdGDataMiner *self;
  TrackerSparqlConnection *connection; /* borrowed from GdGDataMiner */
  gulong miner_cancellable_id;

  GoaAccount *account;
  GDataDocumentsService *service;
  GSimpleAsyncResult *async_result;
  GCancellable *cancellable;

  GHashTable *previous_resources;
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

  g_slice_free (AccountMinerJob, job);
}

static AccountMinerJob *
account_miner_job_new (GdGDataMiner *self,
                       GoaObject *object)
{
  AccountMinerJob *retval;
  GdGDataGoaAuthorizer *authorizer;
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

  authorizer = gd_gdata_goa_authorizer_new (object);
  retval->service = gdata_documents_service_new (GDATA_AUTHORIZER (authorizer));

  /* the service takes ownership of the authorizer */
  g_object_unref (authorizer);

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
                                 GDataDocumentsEntry *doc_entry,
                                 GError **error)
{
  GDataEntry *entry = GDATA_ENTRY (doc_entry);
  gchar *resource = NULL;
  gchar *date, *resource_url, *datasource_urn, *identifier;
  const gchar *class = NULL;

  GList *authors, *l, *parents = NULL;
  GDataAuthor *author;
  GDataLink *parent;

  GDataLink *alternate;
  const gchar *alternate_uri;

  GList *categories;
  GDataCategory *category;
  gboolean starred = FALSE;

  GDataFeed *access_rules = NULL;

  if (GDATA_IS_DOCUMENTS_FOLDER (doc_entry))
    {
      identifier = g_strdup_printf ("gd:collection:%s", gdata_entry_get_id (entry));
      resource_url = NULL;
    }
  else
    {
      gchar *entry_path;

      identifier = g_strdup (gdata_entry_get_id (entry));
      entry_path = gdata_documents_entry_get_path (doc_entry);
      resource_url = g_strdup_printf ("google:docs:%s", entry_path);

      g_free (entry_path);
    }

  /* remove from the list of the previous resources */
  g_hash_table_remove (job->previous_resources, identifier);

  if (GDATA_IS_DOCUMENTS_PRESENTATION (doc_entry))
    class = "nfo:Presentation";
  else if (GDATA_IS_DOCUMENTS_SPREADSHEET (doc_entry))
    class = "nfo:Spreadsheet";
  else if (GDATA_IS_DOCUMENTS_TEXT (doc_entry))
    class = "nfo:PaginatedTextDocument";
  else if (GDATA_IS_DOCUMENTS_FOLDER (doc_entry))
    class = "nfo:DataContainer";
 
  resource = _tracker_sparql_connection_ensure_resource
    (job->connection, 
     job->cancellable, error,
     resource_url, identifier,
     "nfo:RemoteDataObject", class, NULL);
  
  if (*error != NULL)
    goto out;

  datasource_urn = g_strdup_printf ("gd:goa-account:%s", 
                                    goa_account_get_id (job->account));
  _tracker_sparql_connection_set_triple 
    (job->connection, job->cancellable, error,
     identifier, resource,
     "nie:dataSource", datasource_urn);

  g_free (datasource_urn);

  if (*error != NULL)
    goto out;

  alternate = gdata_entry_look_up_link (entry, GDATA_LINK_ALTERNATE);
  alternate_uri = gdata_link_get_uri (alternate);

  _tracker_sparql_connection_insert_or_replace_triple
    (job->connection, 
     job->cancellable, error,
     identifier, resource,
     "nie:url", alternate_uri);

  if (*error != NULL)
    goto out;

  parents = gdata_entry_look_up_links (entry, PARENT_LINK_REL);
  for (l = parents; l != NULL; l = l->next)
    {
      gchar *parent_resource_urn, *parent_resource_id;

      parent = l->data;
      parent_resource_id = 
        g_strdup_printf ("gd:collection:%s", gdata_link_get_uri (parent));

      parent_resource_urn = _tracker_sparql_connection_ensure_resource
        (job->connection, job->cancellable, error,
         NULL, parent_resource_id,
         "nfo:RemoteDataObject", "nfo:DataContainer", NULL);
      g_free (parent_resource_id);

      if (*error != NULL)
        goto out;

      _tracker_sparql_connection_insert_or_replace_triple
        (job->connection,
         job->cancellable, error,
         identifier, resource,
         "nie:isPartOf", parent_resource_urn);
      g_free (parent_resource_urn);

      if (*error != NULL)
        goto out;
    }

  categories = gdata_entry_get_categories (entry);
  for (l = categories; l != NULL; l = l->next)
    {
      category = l->data;
      if (g_strcmp0 (gdata_category_get_term (category), STARRED_CATEGORY_TERM) == 0)
        {
          starred = TRUE;
          break;
        }
    }

  _tracker_sparql_connection_toggle_favorite
    (job->connection, 
     job->cancellable, error,
     resource, starred);

  if (*error != NULL)
    goto out;

  _tracker_sparql_connection_insert_or_replace_triple
    (job->connection, 
     job->cancellable, error,
     identifier, resource,
     "nie:description", gdata_entry_get_summary (entry));

  if (*error != NULL)
    goto out;

  _tracker_sparql_connection_insert_or_replace_triple
    (job->connection, 
     job->cancellable, error,
     identifier, resource,
     "nie:title", gdata_entry_get_title (entry));

  if (*error != NULL)
    goto out;

  authors = gdata_entry_get_authors (entry);
  for (l = authors; l != NULL; l = l->next)
    {
      gchar *contact_resource;

      author = l->data;

      contact_resource = _tracker_utils_ensure_contact_resource (job->connection,
                                                                 job->cancellable, error,
                                                                 gdata_author_get_email_address (author),
                                                                 gdata_author_get_name (author));

      if (*error != NULL)
        goto out;

      _tracker_sparql_connection_insert_or_replace_triple
        (job->connection, 
         job->cancellable, error,
         identifier, resource,
         "nco:creator", contact_resource);

      if (*error != NULL)
        goto out;

      g_free (contact_resource);
    }

  access_rules = gdata_access_handler_get_rules (GDATA_ACCESS_HANDLER (entry),
                                                 GDATA_SERVICE (job->service),
                                                 job->cancellable,
                                                 NULL, NULL, error);

  if (*error != NULL)
      goto out;

  for (l = gdata_feed_get_entries (access_rules); l != NULL; l = l->next)
    {
      GDataAccessRule *rule = l->data;
      const gchar *scope_type;
      const gchar *scope_value;
      gchar *contact_resource;

      gdata_access_rule_get_scope (rule, &scope_type, &scope_value);

      /* default scope access means the document is completely public */
      if (g_strcmp0 (scope_type, GDATA_ACCESS_SCOPE_DEFAULT) == 0)
        continue;

      /* skip domain scopes */
      if (g_strcmp0 (scope_type, GDATA_ACCESS_SCOPE_DOMAIN) == 0)
        continue;

      contact_resource = _tracker_utils_ensure_contact_resource (job->connection,
                                                                 job->cancellable, error,
                                                                 scope_value,
                                                                 "");

      _tracker_sparql_connection_insert_or_replace_triple
        (job->connection,
         job->cancellable, error,
         identifier, resource,
         "nco:contributor", contact_resource);

      g_free (contact_resource);

      if (*error != NULL)
        goto out;
    }

  date = gd_iso8601_from_timestamp (gdata_entry_get_published (entry));
  _tracker_sparql_connection_insert_or_replace_triple
    (job->connection, 
     job->cancellable, error,
     identifier, resource,
     "nie:contentCreated", date);
  g_free (date);

  if (*error != NULL)
    goto out;

  date = gd_iso8601_from_timestamp (gdata_entry_get_updated (entry));
  _tracker_sparql_connection_insert_or_replace_triple
    (job->connection, 
     job->cancellable, error,
     identifier, resource,
     "nie:contentLastModified", date);
  g_free (date);

  if (*error != NULL)
    goto out;

 out:
  g_clear_object (&access_rules);
  g_free (resource_url);
  g_free (resource);
  g_free (identifier);

  g_list_free (parents);

  if (*error != NULL)
    return FALSE;

  return TRUE;
}

static void
account_miner_job_query_gdata (AccountMinerJob *job,
                               GError **error)
{
  GDataDocumentsQuery *query;
  GDataDocumentsFeed *feed;
  GList *entries, *l;

  query = gdata_documents_query_new (NULL);
  gdata_documents_query_set_show_folders (query, TRUE);
  feed = gdata_documents_service_query_documents 
    (job->service, query, 
     job->cancellable, NULL, NULL, error);

  g_object_unref (query);

  if (feed == NULL)
    return;

  entries = gdata_feed_get_entries (GDATA_FEED (feed));
  for (l = entries; l != NULL; l = l->next)
    {
      account_miner_job_process_entry (job, l->data, error);

      if (*error != NULL)
        {
          g_warning ("Unable to process entry %p: %s", l->data, (*error)->message);
          g_clear_error (error);
        }
    }

  g_object_unref (feed);
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
                          "INSERT OR REPLACE { <gd:goa-account:%s> a nie:DataSource ; nao:identifier \"%s\" }",
                          goa_account_get_id (job->account), MINER_IDENTIFIER);

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

  account_miner_job_query_gdata (job, &error);

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
gd_gdata_miner_complete_error (GdGDataMiner *self,
                               GError *error)
{
  g_assert (self->priv->result != NULL);

  g_simple_async_result_take_error (self->priv->result, error);
  g_simple_async_result_complete_in_idle (self->priv->result);  
}

static void
gd_gdata_miner_check_pending_jobs (GdGDataMiner *self)
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
  GdGDataMiner *self = job->self;
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

  gd_gdata_miner_check_pending_jobs (self);
}

static void
gd_gdata_miner_setup_account (GdGDataMiner *self,
                              GoaObject *object)
{
  AccountMinerJob *job;

  job = account_miner_job_new (self, object);
  self->priv->pending_jobs = g_list_prepend (self->priv->pending_jobs, job);

  account_miner_job_process_async (job, miner_job_process_ready_cb, job);
}

typedef struct {
  GdGDataMiner *self;
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
  GdGDataMiner *self = job->self;

  /* now setup all the current accounts */
  for (l = job->doc_objects; l != NULL; l = l->next)
    {
      object = l->data;
      gd_gdata_miner_setup_account (self, object);

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

  gd_gdata_miner_check_pending_jobs (self);

  g_clear_object (&job->self);
  g_slice_free (CleanupJob, job);

  return FALSE;
}

static void
cleanup_job_do_cleanup (CleanupJob *job)
{
  GdGDataMiner *self = job->self;
  GString *select, *update;
  gboolean append_union = FALSE;
  GList *l;
  TrackerSparqlCursor *cursor;
  GError *error = NULL;
  const gchar *resource;

  if (job->old_datasources == NULL)
    return;

  update = g_string_new (NULL);
  g_string_append (update, "DELETE { ");

  /* select all documents from the datasources we want to remove */
  select = g_string_new (NULL);
  g_string_append (select, "SELECT ?urn WHERE { ");

  for (l = job->old_datasources; l != NULL; l = l->next)
    {
      resource = l->data;
      g_debug ("Cleaning up old datasource %s", resource);

      if (append_union)
        g_string_append (select, " UNION ");
      else
        append_union = TRUE;

      g_string_append_printf (select, "{ ?urn nie:dataSource \"%s\" }", resource);

      /* also append the datasource itself to the list of resources to delete */
      g_string_append_printf (update, "<%s> a rdfs:Resource . ", resource);
    }

  g_string_append (select, " }");

  cursor = tracker_sparql_connection_query (self->priv->connection,
                                            select->str,
                                            self->priv->cancellable,
                                            &error);

  g_string_free (select, TRUE);

  if (error != NULL)
    {
      g_printerr ("Error while cleaning up old accounts: %s\n", error->message);
      return;
    }

  /* gather all the documents we want to remove */
  while (tracker_sparql_cursor_next (cursor, self->priv->cancellable, NULL))
    {
      resource = tracker_sparql_cursor_get_string (cursor, 0, NULL);
      g_debug ("Cleaning up resource %s belonging to an old datasource", resource);

      if (resource != NULL)
        g_string_append_printf (update, "<%s> a rdfs:Resource . ", resource);
    }

  g_string_append (update, " }");
  g_object_unref (cursor);

  /* actually remove everything we have to remove */
  tracker_sparql_connection_update (self->priv->connection,
                                    update->str,
                                    G_PRIORITY_DEFAULT,
                                    self->priv->cancellable,
                                    &error);

  g_string_free (update, TRUE);

  if (error != NULL)
    {
      g_printerr ("Error while cleaning up old accounts: %s\n", error->message);
      return;
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
  GdGDataMiner *self = job->self;

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
gd_gdata_miner_cleanup_old_accounts (GdGDataMiner *self,
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
  GdGDataMiner *self = user_data;
  GoaDocuments *documents;
  GoaAccount *account;
  GoaObject *object;
  const gchar *provider_type;
  GError *error = NULL;
  GList *accounts, *doc_objects, *acc_objects, *l;

  self->priv->client = goa_client_new_finish (res, &error);

  if (error != NULL)
    {
      gd_gdata_miner_complete_error (self, error);
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
      if (g_strcmp0 (provider_type, "google") != 0)
        continue;

      acc_objects = g_list_append (acc_objects, g_object_ref (object));

      documents = goa_object_peek_documents (object);
      if (documents == NULL)
        continue;

      doc_objects = g_list_append (doc_objects, g_object_ref (object));
    }

  g_list_free_full (accounts, g_object_unref);

  gd_gdata_miner_cleanup_old_accounts (self, doc_objects, acc_objects);
}

static void
sparql_connection_ready_cb (GObject *object,
                            GAsyncResult *res,
                            gpointer user_data)
{
  GError *error = NULL;
  GdGDataMiner *self = user_data;

  self->priv->connection = tracker_sparql_connection_get_finish (res, &error);

  if (error != NULL)
    {
      gd_gdata_miner_complete_error (self, error);
      return;
    }

  goa_client_new (self->priv->cancellable, client_ready_cb, self);
}

static void
gd_gdata_miner_dispose (GObject *object)
{
  GdGDataMiner *self = GD_GDATA_MINER (object);

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

  G_OBJECT_CLASS (gd_gdata_miner_parent_class)->dispose (object);
}

static void
gd_gdata_miner_init (GdGDataMiner *self)
{
  self->priv =
    G_TYPE_INSTANCE_GET_PRIVATE (self, GD_TYPE_GDATA_MINER, GdGDataMinerPrivate);
}

static void
gd_gdata_miner_class_init (GdGDataMinerClass *klass)
{
  GObjectClass *oclass = G_OBJECT_CLASS (klass);

  oclass->dispose = gd_gdata_miner_dispose;

  g_type_class_add_private (klass, sizeof (GdGDataMinerPrivate));
}

GdGDataMiner *
gd_gdata_miner_new (void)
{
  return g_object_new (GD_TYPE_GDATA_MINER, NULL);
}

void
gd_gdata_miner_refresh_db_async (GdGDataMiner *self,
                                 GCancellable *cancellable,
                                 GAsyncReadyCallback callback,
                                 gpointer user_data)
{
  self->priv->result = 
    g_simple_async_result_new (G_OBJECT (self),
                               callback, user_data,
                               gd_gdata_miner_refresh_db_async);
  self->priv->cancellable = 
    (cancellable != NULL) ? g_object_ref (cancellable) : NULL;

  tracker_sparql_connection_get_async (self->priv->cancellable,
                                       sparql_connection_ready_cb, self);
}

gboolean
gd_gdata_miner_refresh_db_finish (GdGDataMiner *self,
                                  GAsyncResult *res,
                                  GError **error)
{
  GSimpleAsyncResult *simple_res = G_SIMPLE_ASYNC_RESULT (res);

  g_assert (g_simple_async_result_is_valid (res, G_OBJECT (self),
                                            gd_gdata_miner_refresh_db_async));

  if (g_simple_async_result_propagate_error (simple_res, error))
    return FALSE;

  return TRUE;
}
