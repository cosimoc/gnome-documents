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

#ifndef __GD_UTILS_H__
#define __GD_UTILS_H__

#include <gtk/gtk.h>

GtkListStore* gd_create_list_store (void);
void gd_store_set (GtkListStore *store,
                   GtkTreeIter *iter,
                   const gchar *urn,
                   const gchar *uri,
                   const gchar *title,
                   const gchar *author,
                   GdkPixbuf *icon,
                   glong mtime);

GtkListStore* gd_create_item_store (void);
void gd_item_store_set (GtkListStore *store,
                        GtkTreeIter *iter,
                        const gchar *id,
                        const gchar *name,
                        const gchar *heading_text);

GtkListStore* gd_create_organize_store (void);
void gd_organize_store_set (GtkListStore *store,
                            GtkTreeIter *iter,
                            const gchar *id,
                            const gchar *name,
                            gint state);

void gd_queue_thumbnail_job_for_file_async (GFile *file,
                                            GAsyncReadyCallback callback,
                                            gpointer user_data);

gboolean gd_queue_thumbnail_job_for_file_finish (GAsyncResult *res);

void gd_gtk_tree_view_set_activate_on_single_click (GtkTreeView *tree_view,
                                                    gboolean should_activate);

GdkPixbuf *gd_embed_image_in_frame (GdkPixbuf *source_image,
                                    const gchar *frame_image_path,
                                    GtkBorder *slice_width,
                                    GtkBorder *border_width);

char *gd_filename_strip_extension (const char * filename_with_extension);

gboolean gd_time_val_from_iso8601 (const gchar *string,
                                   GTimeVal *timeval);
gchar *gd_iso8601_from_timestamp (gint64 timestamp);

GIcon *gd_create_collection_icon (gint base_size,
                                  GList *pixbufs);
GIcon *gd_create_symbolic_icon (const gchar *name,
                                gint base_size);
void   gd_entry_focus_hack (GtkWidget *entry,
                            GdkDevice *device);

GVariant *gd_create_variant_from_pixbuf (GdkPixbuf *pixbuf);

gchar * gd_format_int_alternative_output (gint intval);

#endif /* __GD_UTILS_H__ */
                                  
