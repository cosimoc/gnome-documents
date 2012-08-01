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

#define GOA_API_IS_SUBJECT_TO_CHANGE
#include <gdata/gdata.h>

#include "gd-gdata-miner.h"

#define MINER_IDENTIFIER "gd:gdata:miner:86ec9bc9-c242-427f-aa19-77b5a2c9b6f0"
#define STARRED_CATEGORY_TERM "http://schemas.google.com/g/2005/labels#starred"
#define PARENT_LINK_REL "http://schemas.google.com/docs/2007#parent"

G_DEFINE_TYPE (GdGDataMiner, gd_gdata_miner, GD_TYPE_MINER)

static gboolean
account_miner_job_process_entry (GdAccountMinerJob *job,
                                 GDataDocumentsEntry *doc_entry,
                                 GError **error)
{
  GDataEntry *entry = GDATA_ENTRY (doc_entry);
  gchar *resource = NULL;
  gchar *date, *resource_url, *identifier;
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
  else if (GDATA_IS_DOCUMENTS_DRAWING (doc_entry))
    class = "nfo:PaginatedTextDocument";
  else if (GDATA_IS_DOCUMENTS_FOLDER (doc_entry))
    class = "nfo:DataContainer";

  resource = gd_miner_tracker_sparql_connection_ensure_resource
    (job->connection,
     job->cancellable, error,
     resource_url, identifier,
     "nfo:RemoteDataObject", class, NULL);

  if (*error != NULL)
    goto out;

  gd_miner_tracker_sparql_connection_set_triple
    (job->connection, job->cancellable, error,
     identifier, resource,
     "nie:dataSource", job->datasource_urn);

  if (*error != NULL)
    goto out;

  alternate = gdata_entry_look_up_link (entry, GDATA_LINK_ALTERNATE);
  alternate_uri = gdata_link_get_uri (alternate);

  gd_miner_tracker_sparql_connection_insert_or_replace_triple
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

      parent_resource_urn = gd_miner_tracker_sparql_connection_ensure_resource
        (job->connection, job->cancellable, error,
         NULL, parent_resource_id,
         "nfo:RemoteDataObject", "nfo:DataContainer", NULL);
      g_free (parent_resource_id);

      if (*error != NULL)
        goto out;

      gd_miner_tracker_sparql_connection_insert_or_replace_triple
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

  gd_miner_tracker_sparql_connection_toggle_favorite
    (job->connection,
     job->cancellable, error,
     resource, starred);

  if (*error != NULL)
    goto out;

  gd_miner_tracker_sparql_connection_insert_or_replace_triple
    (job->connection,
     job->cancellable, error,
     identifier, resource,
     "nie:description", gdata_entry_get_summary (entry));

  if (*error != NULL)
    goto out;

  gd_miner_tracker_sparql_connection_insert_or_replace_triple
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

      contact_resource = gd_miner_tracker_utils_ensure_contact_resource (job->connection,
                                                                         job->cancellable, error,
                                                                         gdata_author_get_email_address (author),
                                                                         gdata_author_get_name (author));

      if (*error != NULL)
        goto out;

      gd_miner_tracker_sparql_connection_insert_or_replace_triple
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

      contact_resource = gd_miner_tracker_utils_ensure_contact_resource (job->connection,
                                                                         job->cancellable, error,
                                                                         scope_value,
                                                                         "");

      gd_miner_tracker_sparql_connection_insert_or_replace_triple
        (job->connection,
         job->cancellable, error,
         identifier, resource,
         "nco:contributor", contact_resource);

      g_free (contact_resource);

      if (*error != NULL)
        goto out;
    }

  date = gd_iso8601_from_timestamp (gdata_entry_get_published (entry));
  gd_miner_tracker_sparql_connection_insert_or_replace_triple
    (job->connection,
     job->cancellable, error,
     identifier, resource,
     "nie:contentCreated", date);
  g_free (date);

  if (*error != NULL)
    goto out;

  date = gd_iso8601_from_timestamp (gdata_entry_get_updated (entry));
  gd_miner_tracker_sparql_connection_insert_or_replace_triple
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
query_gdata (GdAccountMinerJob *job,
             GError **error)
{
  GDataDocumentsQuery *query;
  GDataDocumentsFeed *feed;
  GList *entries, *l;

  query = gdata_documents_query_new (NULL);
  gdata_documents_query_set_show_folders (query, TRUE);
  feed = gdata_documents_service_query_documents
    (GDATA_DOCUMENTS_SERVICE (job->service), query,
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

static GObject *
create_service (GdMiner *self,
                GoaObject *object)
{
  GDataGoaAuthorizer *authorizer;
  GDataDocumentsService *service;

  authorizer = gdata_goa_authorizer_new (object);
  service = gdata_documents_service_new (GDATA_AUTHORIZER (authorizer));

  /* the service takes ownership of the authorizer */
  g_object_unref (authorizer);

  return G_OBJECT (service);
}

static void
gd_gdata_miner_init (GdGDataMiner *miner)
{
}

static void
gd_gdata_miner_class_init (GdGDataMinerClass *klass)
{
  GdMinerClass *miner_class = GD_MINER_CLASS (klass);

  miner_class->goa_provider_type = "google";
  miner_class->miner_identifier = MINER_IDENTIFIER;

  miner_class->create_service = create_service;
  miner_class->query = query_gdata;
}
