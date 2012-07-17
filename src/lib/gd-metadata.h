/* gd-metadata.h - adapted from ev-metadata.h, part of evince,
 *   a gnome document viewer
 *
 * Copyright (C) 2009 Carlos Garcia Campos  <carlosgc@gnome.org>
 *
 * Evince is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * Evince is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 */

#ifndef __GD_METADATA_H__
#define __GD_METADATA_H__

#include <glib-object.h>
#include <gio/gio.h>

G_BEGIN_DECLS

#define GD_TYPE_METADATA         (gd_metadata_get_type())
#define GD_METADATA(object)      (G_TYPE_CHECK_INSTANCE_CAST((object), GD_TYPE_METADATA, GdMetadata))
#define GD_METADATA_CLASS(klass) (G_TYPE_CHECK_CLASS_CAST((klass), GD_TYPE_METADATA, GdMetadataClass))
#define GD_IS_METADATA(object)   (G_TYPE_CHECK_INSTANCE_TYPE((object), GD_TYPE_METADATA))

typedef struct _GdMetadata      GdMetadata;
typedef struct _GdMetadataClass GdMetadataClass;

GType       gd_metadata_get_type              (void) G_GNUC_CONST;
GdMetadata *gd_metadata_new                   (GFile       *file);

gboolean    gd_metadata_get_string            (GdMetadata   *metadata,
					       const gchar  *key,
					       const gchar **value);
gboolean    gd_metadata_set_string            (GdMetadata   *metadata,
					       const gchar  *key,
					       const gchar  *value);
gboolean    gd_metadata_get_int               (GdMetadata   *metadata,
					       const gchar  *key,
					       gint         *value);
gboolean    gd_metadata_set_int               (GdMetadata   *metadata,
					       const gchar  *key,
					       gint          value);
gboolean    gd_metadata_get_double            (GdMetadata   *metadata,
					       const gchar  *key,
					       gdouble      *value);
gboolean    gd_metadata_set_double            (GdMetadata   *metadata,
					       const gchar  *key,
					       gdouble       value);
gboolean    gd_metadata_get_boolean           (GdMetadata   *metadata,
					       const gchar  *key,
					       gboolean     *value);
gboolean    gd_metadata_set_boolean           (GdMetadata   *metadata,
					       const gchar  *key,
					       gboolean      value);
gboolean    gd_metadata_has_key               (GdMetadata   *metadata,
                                               const gchar  *key);

gboolean    gd_is_metadata_supported_for_file (GFile       *file);

G_END_DECLS

#endif /* __GD_METADATA_H__ */
