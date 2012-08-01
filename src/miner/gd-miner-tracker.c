/*
 * Copyright (c) 2011, 2012 Red Hat, Inc.
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

#include <glib.h>

#include "gd-miner-tracker.h"

static gchar *
_tracker_utils_format_into_graph (const gchar *graph)
{
  return (graph != NULL) ? g_strdup_printf ("INTO <%s> ", graph) : g_strdup ("");
}

gchar *
gd_miner_tracker_sparql_connection_ensure_resource (TrackerSparqlConnection *connection,
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

gboolean
gd_miner_tracker_sparql_connection_insert_or_replace_triple (TrackerSparqlConnection *connection,
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

gboolean
gd_miner_tracker_sparql_connection_set_triple (TrackerSparqlConnection *connection,
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
    gd_miner_tracker_sparql_connection_insert_or_replace_triple (connection,
                                                                 cancellable, error,
                                                                 graph, resource,
                                                                 property_name, property_value);

 out:
  return retval;
}

gboolean
gd_miner_tracker_sparql_connection_toggle_favorite (TrackerSparqlConnection *connection,
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

gchar*
gd_miner_tracker_utils_ensure_contact_resource (TrackerSparqlConnection *connection,
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
