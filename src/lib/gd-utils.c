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

#include "gd-utils.h"

#include <gdk-pixbuf/gdk-pixbuf.h>

#define GNOME_DESKTOP_USE_UNSTABLE_API
#include <libgnome-desktop/gnome-desktop-thumbnail.h>

/* FIXME: this is here only because gjs doesn't 
 * support GType handling/arrays yet.
 */
/**
 * gd_create_list_store:
 * 
 * Returns: (transfer full):
 */
GtkListStore *
gd_create_list_store (void)
{
  return gtk_list_store_new (8,
                             G_TYPE_STRING, // URN
                             G_TYPE_STRING, // URI
                             G_TYPE_STRING, // TITLE
                             G_TYPE_STRING, // AUTHOR
                             G_TYPE_STRING, // MTIME
                             GDK_TYPE_PIXBUF, // ICON
                             G_TYPE_STRING, // RESOURCE_URN
                             G_TYPE_BOOLEAN); // FAVORITE
}

void
gd_store_set (GtkListStore *store,
              GtkTreeIter *iter,
              const gchar *urn,
              const gchar *uri,
              const gchar *title,
              const gchar *author,
              const gchar *mtime,
              GdkPixbuf *icon,
              const gchar *resource_urn,
              gboolean favorite)
{
  gtk_list_store_set (store, iter,
                      0, urn,
                      1, uri,
                      2, title,
                      3, author,
                      4, mtime,
                      5, icon,
                      6, resource_urn,
                      7, favorite,
                      -1);
}

void
gd_store_update_icon (GtkListStore *store,
                      GtkTreeIter *iter,
                      GdkPixbuf *icon)
{
  gtk_list_store_set (store, iter,
                      5, icon,
                      -1);
}

/**
 * gd_create_sources_store:
 * 
 * Returns: (transfer full):
 */
GtkListStore *
gd_create_sources_store (void)
{
  return gtk_list_store_new (3,
                             G_TYPE_STRING, // ID
                             G_TYPE_STRING, // NAME
                             G_TYPE_BOOLEAN); // HEADING
}

void
gd_sources_store_set (GtkListStore *store,
                      GtkTreeIter *iter,
                      const gchar *id,
                      const gchar *name,
                      gboolean heading)
{
  gtk_list_store_set (store, iter,
                      0, id,
                      1, name,
                      2, heading,
                      -1);
}

/**
 * gd_create_sidebar_store:
 *
 * Returns: (transfer full):
 */
GtkListStore *
gd_create_sidebar_store (void)
{
  return gtk_list_store_new (4,
                             G_TYPE_STRING, // ID
                             G_TYPE_STRING, // NAME
                             G_TYPE_STRING, // ICON
                             G_TYPE_BOOLEAN); // HEADING
}

void
gd_sidebar_store_set (GtkListStore *store,
                      GtkTreeIter *iter,
                      const gchar *id,
                      const gchar *name,
                      const gchar *icon_name,
                      gboolean heading)
{
  gtk_list_store_set (store, iter,
                      0, id,
                      1, name,
                      2, icon_name,
                      3, heading,
                      -1);
}

#define ATTRIBUTES_FOR_THUMBNAIL \
  G_FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE"," \
  G_FILE_ATTRIBUTE_TIME_MODIFIED

static gboolean
create_thumbnail (GIOSchedulerJob *job,
                  GCancellable *cancellable,
                  gpointer user_data)
{
  GSimpleAsyncResult *result = user_data;
  GFile *file = G_FILE (g_async_result_get_source_object (G_ASYNC_RESULT (result)));
  GnomeDesktopThumbnailFactory *factory;
  GFileInfo *info;
  gchar *uri;
  GdkPixbuf *pixbuf;
  guint64 mtime;

  uri = g_file_get_uri (file);
  info = g_file_query_info (file, ATTRIBUTES_FOR_THUMBNAIL,
                            G_FILE_QUERY_INFO_NONE,
                            NULL, NULL);

  /* we don't care about reporting errors here, just fail the
   * thumbnail.
   */
  if (info == NULL)
    {
      g_simple_async_result_set_op_res_gboolean (result, FALSE);
      goto out;
    }

  mtime = g_file_info_get_attribute_uint64 (info, G_FILE_ATTRIBUTE_TIME_MODIFIED);

  factory = gnome_desktop_thumbnail_factory_new (GNOME_DESKTOP_THUMBNAIL_SIZE_NORMAL);
  pixbuf = gnome_desktop_thumbnail_factory_generate_thumbnail
    (factory, 
     uri, g_file_info_get_content_type (info));

  if (pixbuf != NULL)
    {
      gnome_desktop_thumbnail_factory_save_thumbnail (factory, pixbuf,
                                                      uri, (time_t) mtime);
      g_simple_async_result_set_op_res_gboolean (result, TRUE);
    }
  else
    {
      g_simple_async_result_set_op_res_gboolean (result, FALSE);
    }

  g_object_unref (info);
  g_object_unref (file);
  g_object_unref (factory);
  g_clear_object (&pixbuf);

 out:
  g_simple_async_result_complete_in_idle (result);
  g_object_unref (result);

  return FALSE;
}

void
gd_queue_thumbnail_job_for_file_async (GFile *file,
                                       GAsyncReadyCallback callback,
                                       gpointer user_data)
{
  GSimpleAsyncResult *result;

  result = g_simple_async_result_new (G_OBJECT (file),
                                      callback, user_data, 
                                      gd_queue_thumbnail_job_for_file_async);

  g_io_scheduler_push_job (create_thumbnail,
                           result, NULL,
                           G_PRIORITY_DEFAULT, NULL);
}

gboolean
gd_queue_thumbnail_job_for_file_finish (GAsyncResult *res)
{
  GSimpleAsyncResult *simple = G_SIMPLE_ASYNC_RESULT (res);

  return g_simple_async_result_get_op_res_gboolean (simple);
}

/* taken from eel/eel-gtk-extensions.c */
static gboolean 
tree_view_button_press_callback (GtkWidget *tree_view,
				 GdkEventButton *event,
				 gpointer data)
{
	GtkTreePath *path;
	GtkTreeViewColumn *column;

	if (event->button == 1 && event->type == GDK_BUTTON_PRESS) {
		if (gtk_tree_view_get_path_at_pos (GTK_TREE_VIEW (tree_view),
						   event->x, event->y,
						   &path,
						   &column,
						   NULL, 
						   NULL)) {
			gtk_tree_view_row_activated
				(GTK_TREE_VIEW (tree_view), path, column);
		}
	}

	return FALSE;
}

void
gd_gtk_tree_view_set_activate_on_single_click (GtkTreeView *tree_view,
                                               gboolean should_activate)
{
	guint button_press_id;

	button_press_id = GPOINTER_TO_UINT 
		(g_object_get_data (G_OBJECT (tree_view), 
				    "gd-tree-view-activate"));

	if (button_press_id && !should_activate) {
		g_signal_handler_disconnect (tree_view, button_press_id);
		g_object_set_data (G_OBJECT (tree_view), 
				   "gd-tree-view-activate", 
				   NULL);
	} else if (!button_press_id && should_activate) {
		button_press_id = g_signal_connect 
			(tree_view,
			 "button_press_event",
			 G_CALLBACK  (tree_view_button_press_callback),
			 NULL);
		g_object_set_data (G_OBJECT (tree_view), 
				   "gd-tree-view-activate", 
				   GUINT_TO_POINTER (button_press_id));
	}
}

guint
gd_gdk_event_get_button (GdkEvent *event)
{
  GdkEventButton *button_ev = (GdkEventButton *) event;

  return button_ev->button;
}

/**
 * gd_gdk_event_get_position:
 * @event:
 * @x: (out):
 * @y: (out):
 *
 */
void
gd_gdk_event_get_position (GdkEvent *event,
                           gdouble *x,
                           gdouble *y)
{
  GdkEventButton *button_ev = (GdkEventButton *) event;

  if (x)
    *x = button_ev->x;

  if (y)
    *y = button_ev->y;
}

void
gd_gtk_menu_popup (GtkMenu *menu,
                   guint button,
                   guint32 timestamp)
{
  gtk_menu_popup (menu, NULL, NULL, NULL, NULL, button, timestamp);
}
