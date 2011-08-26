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
                   const gchar *mtime,
                   GdkPixbuf *icon,
                   const gchar *resource_urn,
                   gboolean favorite);

void gd_store_update_icon (GtkListStore *store,
                           GtkTreeIter *iter,
                           GdkPixbuf *icon);

GtkListStore* gd_create_sources_store (void);
void gd_sources_store_set (GtkListStore *store,
                           GtkTreeIter *iter,
                           const gchar *id,
                           const gchar *name,
                           gboolean heading);

GtkListStore * gd_create_sidebar_store (void);
void gd_sidebar_store_set (GtkListStore *store,
                           GtkTreeIter *iter,
                           const gchar *id,
                           const gchar *name,
                           const gchar *icon_name,
                           gboolean heading);

guint gd_gdk_event_get_button (GdkEvent *event);
void  gd_gdk_event_get_position (GdkEvent *event,
                                 gdouble *x,
                                 gdouble *y);

void gd_queue_thumbnail_job_for_file_async (GFile *file,
                                            GAsyncReadyCallback callback,
                                            gpointer user_data);

gboolean gd_queue_thumbnail_job_for_file_finish (GAsyncResult *res);

void gd_gtk_tree_view_set_activate_on_single_click (GtkTreeView *tree_view,
                                                    gboolean should_activate);

#endif /* __GD_UTILS_H__ */
                                  
