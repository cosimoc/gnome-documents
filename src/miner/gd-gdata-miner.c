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

#define DATASOURCE_URN "urn:nepomuk:datasource:86ec9bc9-c242-427f-aa19-77b5a2c9b6f0"
#define STARRED_CATEGORY_TERM "http://schemas.google.com/g/2005/labels#starred"

G_DEFINE_TYPE (GdGDataMiner, gd_gdata_miner, G_TYPE_OBJECT)

struct _GdGDataMinerPrivate {
  GoaClient *client;
  GDataDocumentsService *service;
  TrackerSparqlConnection *connection;

  GCancellable *cancellable;
  GSimpleAsyncResult *result;
};

static void
gd_gdata_miner_complete_error (GdGDataMiner *self,
                               GError *error)
{
  g_assert (self->priv->result != NULL);

  g_simple_async_result_take_error (self->priv->result, error);
  g_simple_async_result_complete_in_idle (self->priv->result);
}

static gchar *
_tracker_utils_format_into_graph (const gchar *graph)
{
  return (graph != NULL) ? g_strdup_printf ("INTO <%s> ", graph) : NULL;
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

static gchar *
_tracker_utils_iso8601_from_timestamp (gint64 timestamp)
{
  GTimeVal tv;

  tv.tv_sec = timestamp;
  tv.tv_usec = 0;
  return g_time_val_to_iso8601 (&tv);
}

static void
gd_gdata_miner_process_entry (GdGDataMiner *self,
                              GDataDocumentsEntry *doc_entry,
                              GError **error)
{
  GDataEntry *entry = GDATA_ENTRY (doc_entry);
  gchar *resource;
  gchar *date, *resource_url;
  const gchar *identifier, *class = NULL;

  GList *authors, *l;
  GDataAuthor *author;

  GDataLink *alternate;
  const gchar *alternate_uri;

  GList *categories;
  GDataCategory *category;
  gboolean starred = FALSE;

  GDataFeed *access_rules = NULL;

  if (!GDATA_IS_DOCUMENTS_DOCUMENT (doc_entry))
    {
      /* TODO: folders */
      g_print ("found a folder?\n");
      return;
    }

  identifier = gdata_entry_get_id (entry);
  resource_url = g_strdup_printf 
    ("google:docs:%s", 
     gdata_documents_entry_get_path (doc_entry));

  if (GDATA_IS_DOCUMENTS_PRESENTATION (doc_entry))
    class = "nfo:Presentation";
  else if (GDATA_IS_DOCUMENTS_SPREADSHEET (doc_entry))
    class = "nfo:Spreadsheet";
  else if (GDATA_IS_DOCUMENTS_TEXT (doc_entry))
    class = "nfo:PaginatedTextDocument";

  resource = _tracker_sparql_connection_ensure_resource
    (self->priv->connection, 
     self->priv->cancellable, error,
     resource_url, identifier,
     "nfo:RemoteDataObject",
     class,
     NULL);

  if (*error != NULL)
    goto out;

  _tracker_sparql_connection_set_triple 
    (self->priv->connection, self->priv->cancellable, error,
     identifier, resource,
     "nie:dataSource", DATASOURCE_URN);

  alternate = gdata_entry_look_up_link (entry, GDATA_LINK_ALTERNATE);
  alternate_uri = gdata_link_get_uri (alternate);

  _tracker_sparql_connection_insert_or_replace_triple
    (self->priv->connection, 
     self->priv->cancellable, error,
     identifier, resource,
     "nie:url", alternate_uri);

  if (*error != NULL)
    goto out;

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
    (self->priv->connection, 
     self->priv->cancellable, error,
     resource, starred);

  if (*error != NULL)
    goto out;

  _tracker_sparql_connection_insert_or_replace_triple
    (self->priv->connection, 
     self->priv->cancellable, error,
     identifier, resource,
     "nie:description", gdata_entry_get_summary (entry));

  if (*error != NULL)
    goto out;

  _tracker_sparql_connection_insert_or_replace_triple
    (self->priv->connection, 
     self->priv->cancellable, error,
     identifier, resource,
     "nie:title", gdata_entry_get_title (entry));

  if (*error != NULL)
    goto out;

  authors = gdata_entry_get_authors (entry);
  for (l = authors; l != NULL; l = l->next)
    {
      gchar *contact_resource;

      author = l->data;

      contact_resource = _tracker_utils_ensure_contact_resource (self->priv->connection,
                                                                 self->priv->cancellable, error,
                                                                 gdata_author_get_email_address (author),
                                                                 gdata_author_get_name (author));

      if (*error != NULL)
        goto out;

      _tracker_sparql_connection_insert_or_replace_triple
        (self->priv->connection, 
         self->priv->cancellable, error,
         identifier, resource,
         "nco:creator", contact_resource);

      if (*error != NULL)
        goto out;

      g_free (contact_resource);
    }

  access_rules = gdata_access_handler_get_rules (GDATA_ACCESS_HANDLER (entry),
                                                 GDATA_SERVICE (self->priv->service),
                                                 self->priv->cancellable,
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

      contact_resource = _tracker_utils_ensure_contact_resource (self->priv->connection,
                                                                 self->priv->cancellable, error,
                                                                 scope_value,
                                                                 "");

      _tracker_sparql_connection_insert_or_replace_triple
        (self->priv->connection,
         self->priv->cancellable, error,
         identifier, resource,
         "nco:contributor", contact_resource);

      g_free (contact_resource);

      if (*error != NULL)
        goto out;
    }

  date = _tracker_utils_iso8601_from_timestamp (gdata_entry_get_published (entry));
  _tracker_sparql_connection_insert_or_replace_triple
    (self->priv->connection, 
     self->priv->cancellable, error,
     identifier, resource,
     "nie:contentCreated", date);
  g_free (date);

  if (*error != NULL)
    goto out;

  date = _tracker_utils_iso8601_from_timestamp (gdata_entry_get_updated (entry));
  _tracker_sparql_connection_insert_or_replace_triple
    (self->priv->connection, 
     self->priv->cancellable, error,
     identifier, resource,
     "nie:contentLastModified", date);
  g_free (date);

  if (*error != NULL)
    goto out;

 out:
  g_clear_object (&access_rules);
  g_free (resource_url);
}

static void
gd_gdata_miner_query (GdGDataMiner *self)
{
  GDataDocumentsQuery *query;
  GDataDocumentsFeed *feed;
  GError *error = NULL;
  GList *entries, *l;

  query = gdata_documents_query_new (NULL);
  feed = gdata_documents_service_query_documents 
    (self->priv->service, query, 
     self->priv->cancellable, NULL, NULL, &error);

  g_object_unref (query);

  if (error != NULL)
    {
      gd_gdata_miner_complete_error (self, error);
      return;
   }

  entries = gdata_feed_get_entries (GDATA_FEED (feed));
  for (l = entries; l != NULL; l = l->next)
    {
      gd_gdata_miner_process_entry (self, l->data, &error);

      if (error != NULL)
        {
          gd_gdata_miner_complete_error (self, error);
          g_object_unref (feed);

          return;
        }
    }

  g_simple_async_result_complete_in_idle (self->priv->result);
  g_object_unref (feed);
}

static void
gd_gdata_ensure_tracker_connection (GdGDataMiner *self,
                                    GoaObject *object,
                                    GError **error)
{
  GString *datasource_insert;
  GoaAccount *account;

  if (self->priv->connection != NULL)
    return;

  self->priv->connection = 
    tracker_sparql_connection_get (self->priv->cancellable, error);

  if (*error != NULL)
    return;

  account = goa_object_peek_account (object);
  datasource_insert = g_string_new (NULL);
  g_string_append_printf (datasource_insert,
                          "INSERT { <%s> a nie:DataSource ; nao:identifier \"goa:documents:%s\" }",
                          DATASOURCE_URN, goa_account_get_id (account));

  tracker_sparql_connection_update (self->priv->connection, datasource_insert->str,
                                    G_PRIORITY_DEFAULT, self->priv->cancellable,
                                    error);
}

static void
gd_gdata_miner_setup_account (GdGDataMiner *self,
                              GoaObject *object)
{
  GdGDataGoaAuthorizer *authorizer;
  GError *error = NULL;

  authorizer = gd_gdata_goa_authorizer_new (object);
  self->priv->service = 
    gdata_documents_service_new (GDATA_AUTHORIZER (authorizer));

  /* the service takes ownership of the authorizer */
  g_object_unref (authorizer);

  gd_gdata_ensure_tracker_connection (self, object, &error);

  if (error != NULL)
    {
      gd_gdata_miner_complete_error (self, error);
      return;
    }

  gd_gdata_miner_query (self);
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
  GList *accounts, *l;
  gboolean found = FALSE;

  self->priv->client = goa_client_new_finish (res, &error);

  if (error != NULL)
    {
      gd_gdata_miner_complete_error (self, error);
      return;
    }

  accounts = goa_client_get_accounts (self->priv->client);
  for (l = accounts; l != NULL; l = l->next)
    {
      object = l->data;

      documents = goa_object_peek_documents (object);
      if (documents == NULL)
        continue;

      account = goa_object_peek_account (object);
      if (account == NULL)
        continue;

      provider_type = goa_account_get_provider_type (account);
      if (g_strcmp0 (provider_type, "google") != 0)
        continue;

      found = TRUE;
      gd_gdata_miner_setup_account (self, object);
    }

  g_list_free_full (accounts, g_object_unref);

  if (!found)
    {
      gd_gdata_miner_complete_error (self,
                                     g_error_new_literal (G_IO_ERROR,
                                                          G_IO_ERROR_NOT_FOUND,
                                                          "No GOA resource found supporting documents"));
      return;
    }
}

static void
gd_gdata_miner_dispose (GObject *object)
{
  GdGDataMiner *self = GD_GDATA_MINER (object);

  g_clear_object (&self->priv->service);
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

  goa_client_new (self->priv->cancellable, client_ready_cb, self);  
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
