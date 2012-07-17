/* gd-metadata.c - adapted from ev-metadata.c, part of evince,
 *   a gnome document viewer
 *
 * Copyright (C) 2009 Carlos Garcia Campos  <carlosgc@gnome.org>
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 */

#include <gio/gio.h>
#include <string.h>

#include "gd-metadata.h"

struct _GdMetadata {
  GObject base;

  GFile      *file;
  GHashTable *items;
};

struct _GdMetadataClass {
  GObjectClass base_class;
};

enum {
  PROP_FILE = 1,
  NUM_PROPERTIES
};

static GParamSpec *properties[NUM_PROPERTIES] = { NULL, };

G_DEFINE_TYPE (GdMetadata, gd_metadata, G_TYPE_OBJECT)

#define GD_METADATA_NAMESPACE "metadata::gnome-documents"

static void
gd_metadata_finalize (GObject *object)
{
  GdMetadata *metadata = GD_METADATA (object);

  g_clear_pointer (&metadata->items, (GDestroyNotify) g_hash_table_unref);
  g_clear_object (&metadata->file);

  G_OBJECT_CLASS (gd_metadata_parent_class)->finalize (object);
}

static void
gd_metadata_init (GdMetadata *metadata)
{
  metadata->items = g_hash_table_new_full 
    (g_str_hash, g_str_equal, g_free, g_free);
}

static void
gd_metadata_set_property (GObject      *object,
			  guint         property_id,
			  const GValue *value,
			  GParamSpec   *pspec)
{
  GdMetadata *self = GD_METADATA (object);

  switch (property_id)
    {
    case PROP_FILE:
      self->file = g_value_dup_object (value);
      break;
    default:
      G_OBJECT_WARN_INVALID_PROPERTY_ID (object, property_id, pspec);
      break;
    }
}

static void
gd_metadata_load (GdMetadata *metadata)
{
  GFileInfo *info;
  gchar    **attrs;
  gint       i;
  GError    *error = NULL;

  info = g_file_query_info (metadata->file, "metadata::*", 0, NULL, &error);
  if (!info)
    {
      g_warning ("%s", error->message);
      g_error_free (error);

      return;
    }

  if (!g_file_info_has_namespace (info, "metadata"))
    {
      g_object_unref (info);
      return;
    }

  attrs = g_file_info_list_attributes (info, "metadata");
  for (i = 0; attrs[i]; i++)
    {
      GFileAttributeType type;
      gpointer           value;
      const gchar       *key;

      if (!g_str_has_prefix (attrs[i], GD_METADATA_NAMESPACE))
        continue;

      if (!g_file_info_get_attribute_data (info, attrs[i],
                                           &type, &value, NULL))
        continue;

      key = attrs[i] + strlen (GD_METADATA_NAMESPACE"::");

      if (type == G_FILE_ATTRIBUTE_TYPE_STRING)
        g_hash_table_insert (metadata->items,
                             g_strdup (key), g_strdup (value));
    }

  g_strfreev (attrs);
  g_object_unref (info);
}

static void
gd_metadata_constructed (GObject *object)
{
  GdMetadata *self = GD_METADATA (object);

  G_OBJECT_CLASS (gd_metadata_parent_class)->constructed (object);

  if (self->file == NULL)
    return;

  gd_metadata_load (self);
}

static void
gd_metadata_class_init (GdMetadataClass *klass)
{
  GObjectClass *oclass = G_OBJECT_CLASS (klass);

  oclass->finalize = gd_metadata_finalize;
  oclass->set_property = gd_metadata_set_property;
  oclass->constructed = gd_metadata_constructed;

  properties[PROP_FILE] =
    g_param_spec_object ("file", "Document file",
                         "Document file",
                         G_TYPE_FILE,
                         G_PARAM_WRITABLE | G_PARAM_CONSTRUCT_ONLY);
  g_object_class_install_properties (oclass, NUM_PROPERTIES, properties);
}

GdMetadata *
gd_metadata_new (GFile *file)
{
  return g_object_new (GD_TYPE_METADATA, "file", file, NULL);
}

/**
 * gd_metadata_get_string:
 * @metadata:
 * @key:
 * @value: (out):
 *
 * Returns:
 */
gboolean
gd_metadata_get_string (GdMetadata   *metadata,
			const gchar  *key,
			const gchar **value)
{
  const gchar *v;

  v = g_hash_table_lookup (metadata->items, key);
  if (!v)
    return FALSE;

  *value = v;
  return TRUE;
}

static void
metadata_set_callback (GObject      *file,
		       GAsyncResult *result,
		       gpointer      user_data)
{
  GError *error = NULL;

  if (!g_file_set_attributes_finish (G_FILE (file), result, NULL, &error))
    {
      g_warning ("%s", error->message);
      g_error_free (error);
    }
}

/**
 * gd_metadata_set_string:
 * @metadata:
 * @key:
 * @value: (allow-none):
 *
 * Returns:
 */
gboolean
gd_metadata_set_string (GdMetadata  *metadata,
			const gchar *key,
			const gchar *value)
{
  GFileInfo *info;
  gchar     *gio_key;

  info = g_file_info_new ();

  gio_key = g_strconcat (GD_METADATA_NAMESPACE"::", key, NULL);
  if (value)
    g_file_info_set_attribute_string (info, gio_key, value);
  else
    g_file_info_set_attribute (info, gio_key,
                               G_FILE_ATTRIBUTE_TYPE_INVALID,
                               NULL);

  g_free (gio_key);

  g_hash_table_insert (metadata->items, g_strdup (key), g_strdup (value));
  g_file_set_attributes_async (metadata->file, info,
                               0, G_PRIORITY_DEFAULT, NULL,
                               metadata_set_callback, metadata);
  g_object_unref (info);

  return TRUE;
}

/**
 * gd_metadata_get_int:
 * @metadata:
 * @key:
 * @value: (out):
 *
 * Returns:
 */
gboolean
gd_metadata_get_int (GdMetadata  *metadata,
		     const gchar *key,
		     gint        *value)
{
  const gchar *string_value;
  gchar *endptr;
  gint   int_value;

  if (!gd_metadata_get_string (metadata, key, &string_value))
    return FALSE;

  int_value = g_ascii_strtoull (string_value, &endptr, 0);
  if (int_value == 0 && string_value == endptr)
    return FALSE;

  *value = int_value;
  return TRUE;
}

gboolean
gd_metadata_set_int (GdMetadata  *metadata,
		     const gchar *key,
		     gint         value)
{
  gchar string_value[32];

  g_snprintf (string_value, sizeof (string_value), "%d", value);

  return gd_metadata_set_string (metadata, key, string_value);
}

/**
 * gd_metadata_get_double:
 * @metadata:
 * @key:
 * @value: (out):
 *
 * Returns:
 */
gboolean
gd_metadata_get_double (GdMetadata  *metadata,
			const gchar *key,
			gdouble     *value)
{
  const gchar *string_value;
  gchar  *endptr;
  gdouble double_value;

  if (!gd_metadata_get_string (metadata, key, &string_value))
    return FALSE;

  double_value = g_ascii_strtod (string_value, &endptr);
  if (double_value == 0. && string_value == endptr)
    return FALSE;

  *value = double_value;
  return TRUE;
}

gboolean
gd_metadata_set_double (GdMetadata  *metadata,
			const gchar *key,
			gdouble      value)
{
  gchar string_value[G_ASCII_DTOSTR_BUF_SIZE];

  g_ascii_dtostr (string_value, G_ASCII_DTOSTR_BUF_SIZE, value);

  return gd_metadata_set_string (metadata, key, string_value);
}

/**
 * gd_metadata_get_boolean:
 * @metadata:
 * @key:
 * @value: (out):
 *
 * Returns:
 */
gboolean
gd_metadata_get_boolean (GdMetadata  *metadata,
			 const gchar *key,
			 gboolean    *value)
{
  gint int_value;

  if (!gd_metadata_get_int (metadata, key, &int_value))
    return FALSE;

  *value = int_value;
  return TRUE;
}

gboolean
gd_metadata_set_boolean (GdMetadata  *metadata,
			 const gchar *key,
			 gboolean     value)
{
  return gd_metadata_set_string (metadata, key, value ? "1" : "0");
}

/**
 * gd_metadata_has_key:
 * @metadata:
 * @key: (allow-none):
 *
 * Returns:
 */
gboolean
gd_metadata_has_key (GdMetadata  *metadata,
                     const gchar *key)
{
  return g_hash_table_lookup (metadata->items, key) != NULL;
}

gboolean
gd_is_metadata_supported_for_file (GFile *file)
{
  GFileAttributeInfoList *namespaces;
  gint i;
  gboolean retval = FALSE;

  namespaces = g_file_query_writable_namespaces (file, NULL, NULL);
  if (!namespaces)
    return retval;

  for (i = 0; i < namespaces->n_infos; i++)
    {
      if (strcmp (namespaces->infos[i].name, "metadata") == 0) {
        retval = TRUE;
        break;
      }
    }

  g_file_attribute_info_list_unref (namespaces);

  return retval;
}
