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
#include <string.h>

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
  return gtk_list_store_new (5,
                             G_TYPE_STRING, // URN
                             G_TYPE_STRING, // TITLE
                             G_TYPE_STRING, // AUTHOR
                             GDK_TYPE_PIXBUF, // ICON
                             G_TYPE_LONG); // MTIME
}

void
gd_store_set (GtkListStore *store,
              GtkTreeIter *iter,
              const gchar *urn,
              const gchar *title,
              const gchar *author,
              GdkPixbuf *icon,
              glong mtime)
{
  gtk_list_store_set (store, iter,
                      0, urn,
                      1, title,
                      2, author,
                      3, icon,
                      4, mtime,
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

/* utility to stretch a frame to the desired size */

static void
draw_frame_row (GdkPixbuf *frame_image, int target_width, int source_width, int source_v_position, int dest_v_position, GdkPixbuf *result_pixbuf, int left_offset, int height)
{
	int remaining_width, h_offset, slab_width;
	
	remaining_width = target_width;
	h_offset = 0;
	while (remaining_width > 0) {	
		slab_width = remaining_width > source_width ? source_width : remaining_width;
		gdk_pixbuf_copy_area (frame_image, left_offset, source_v_position, slab_width, height, result_pixbuf, left_offset + h_offset, dest_v_position);
		remaining_width -= slab_width;
		h_offset += slab_width; 
	}
}

/* utility to draw the middle section of the frame in a loop */
static void
draw_frame_column (GdkPixbuf *frame_image, int target_height, int source_height, int source_h_position, int dest_h_position, GdkPixbuf *result_pixbuf, int top_offset, int width)
{
	int remaining_height, v_offset, slab_height;
	
	remaining_height = target_height;
	v_offset = 0;
	while (remaining_height > 0) {	
		slab_height = remaining_height > source_height ? source_height : remaining_height;
		gdk_pixbuf_copy_area (frame_image, source_h_position, top_offset, width, slab_height, result_pixbuf, dest_h_position, top_offset + v_offset);
		remaining_height -= slab_height;
		v_offset += slab_height; 
	}
}

static GdkPixbuf *
gd_stretch_frame_image (GdkPixbuf *frame_image, int left_offset, int top_offset, int right_offset, int bottom_offset,
			 int dest_width, int dest_height, gboolean fill_flag)
{
	GdkPixbuf *result_pixbuf;
	guchar *pixels_ptr;
	int frame_width, frame_height;
	int y, row_stride;
	int target_width, target_frame_width;
	int target_height, target_frame_height;
	
	frame_width  = gdk_pixbuf_get_width  (frame_image);
	frame_height = gdk_pixbuf_get_height (frame_image );
	
	if (fill_flag) {
		result_pixbuf = gdk_pixbuf_scale_simple (frame_image, dest_width, dest_height, GDK_INTERP_NEAREST);
	} else {
		result_pixbuf = gdk_pixbuf_new (GDK_COLORSPACE_RGB, TRUE, 8, dest_width, dest_height);
	}
	row_stride = gdk_pixbuf_get_rowstride (result_pixbuf);
	pixels_ptr = gdk_pixbuf_get_pixels (result_pixbuf);
	
	/* clear the new pixbuf */
	if (!fill_flag) {
		for (y = 0; y < dest_height; y++) {
			memset (pixels_ptr, 255, row_stride);
			pixels_ptr += row_stride; 
		}
	}
	
	target_width  = dest_width - left_offset - right_offset;
	target_frame_width = frame_width - left_offset - right_offset;
	
	target_height  = dest_height - top_offset - bottom_offset;
	target_frame_height = frame_height - top_offset - bottom_offset;
	
	/* draw the left top corner  and top row */
	gdk_pixbuf_copy_area (frame_image, 0, 0, left_offset, top_offset, result_pixbuf, 0,  0);
	draw_frame_row (frame_image, target_width, target_frame_width, 0, 0, result_pixbuf, left_offset, top_offset);
	
	/* draw the right top corner and left column */
	gdk_pixbuf_copy_area (frame_image, frame_width - right_offset, 0, right_offset, top_offset, result_pixbuf, dest_width - right_offset,  0);
	draw_frame_column (frame_image, target_height, target_frame_height, 0, 0, result_pixbuf, top_offset, left_offset);

	/* draw the bottom right corner and bottom row */
	gdk_pixbuf_copy_area (frame_image, frame_width - right_offset, frame_height - bottom_offset, right_offset, bottom_offset, result_pixbuf, dest_width - right_offset,  dest_height - bottom_offset);
	draw_frame_row (frame_image, target_width, target_frame_width, frame_height - bottom_offset, dest_height - bottom_offset, result_pixbuf, left_offset, bottom_offset);
		
	/* draw the bottom left corner and the right column */
	gdk_pixbuf_copy_area (frame_image, 0, frame_height - bottom_offset, left_offset, bottom_offset, result_pixbuf, 0,  dest_height - bottom_offset);
	draw_frame_column (frame_image, target_height, target_frame_height, frame_width - right_offset, dest_width - right_offset, result_pixbuf, top_offset, right_offset);
	
	return result_pixbuf;
}

/**
 * gd_embed_image_in_frame: 
 * @source_image:
 * @frame_image:
 * @left_offset:
 * @top_offset:
 * @right_offset:
 * @bottom_offset:
 *
 * Returns: (transfer full):
 */
/* draw an arbitrary frame around an image, with the result passed back in a newly allocated pixbuf */
GdkPixbuf *
gd_embed_image_in_frame (GdkPixbuf *source_image,
                         GdkPixbuf *frame_image,
                         int left_offset, 
                         int top_offset, 
                         int right_offset, 
                         int bottom_offset)
{
	GdkPixbuf *result_pixbuf;
	int source_width, source_height;
	int dest_width, dest_height;
	
	source_width  = gdk_pixbuf_get_width  (source_image);
	source_height = gdk_pixbuf_get_height (source_image);

	dest_width  = source_width  + left_offset + right_offset;
	dest_height = source_height + top_offset  + bottom_offset;
	
	result_pixbuf = gd_stretch_frame_image (frame_image, left_offset, top_offset, right_offset, bottom_offset, 
                                                dest_width, dest_height, FALSE);
		
	/* Finally, copy the source image into the framed area */
	gdk_pixbuf_copy_area (source_image, 0, 0, source_width, source_height, result_pixbuf, left_offset,  top_offset);

	return result_pixbuf;
}

static char *
gd_filename_get_extension_offset (const char *filename)
{
	char *end, *end2;

	end = strrchr (filename, '.');

	if (end && end != filename) {
		if (strcmp (end, ".gz") == 0 ||
		    strcmp (end, ".bz2") == 0 ||
		    strcmp (end, ".sit") == 0 ||
		    strcmp (end, ".Z") == 0) {
			end2 = end - 1;
			while (end2 > filename &&
			       *end2 != '.') {
				end2--;
			}
			if (end2 != filename) {
				end = end2;
			}
		}
	}

	return end;
}

/**
 * gd_filename_strip_extension:
 * @filename_with_extension:
 *
 * Returns: (transfer full):
 */
char *
gd_filename_strip_extension (const char * filename_with_extension)
{
	char *filename, *end;

	if (filename_with_extension == NULL) {
		return NULL;
	}

	filename = g_strdup (filename_with_extension);
	end = gd_filename_get_extension_offset (filename);

	if (end && end != filename) {
		*end = '\0';
	}

	return filename;
}

/**
 * gd_time_val_from_iso8601:
 * @string:
 * @timeval: (out):
 *
 * Returns:
 */
gboolean
gd_time_val_from_iso8601 (const gchar *string,
                          GTimeVal *timeval)
{
  return g_time_val_from_iso8601 (string, timeval);
}

#define _BG_MIN_SIZE 20
#define _EMBLEM_MIN_SIZE 8

/**
 * gd_create_symbolic_icon:
 * @name:
 *
 * Returns: (transfer full):
 */
GIcon *
gd_create_symbolic_icon (const gchar *name,
                         gint base_size)
{
  gchar *symbolic_name;
  GIcon *icon, *retval = NULL;
  cairo_surface_t *surface;
  cairo_t *cr;
  GtkStyleContext *style;
  GtkWidgetPath *path;
  GdkPixbuf *pixbuf;
  GtkIconTheme *theme;
  GtkIconInfo *info;
  gint bg_size;
  gint emblem_size;
  gint total_size;

  total_size = base_size / 2;
  bg_size = MAX (total_size / 2, _BG_MIN_SIZE);
  emblem_size = MAX (bg_size - 8, _EMBLEM_MIN_SIZE);

  surface = cairo_image_surface_create (CAIRO_FORMAT_ARGB32, total_size, total_size);
  cr = cairo_create (surface);

  style = gtk_style_context_new ();

  path = gtk_widget_path_new ();
  gtk_widget_path_append_type (path, GTK_TYPE_ICON_VIEW);
  gtk_style_context_set_path (style, path);
  gtk_widget_path_unref (path);

  gtk_style_context_add_class (style, "documents-icon-bg");

  gtk_render_background (style, cr, (total_size - bg_size) / 2, (total_size - bg_size) / 2, bg_size, bg_size);

  symbolic_name = g_strconcat (name, "-symbolic", NULL);
  icon = g_themed_icon_new (symbolic_name);

  theme = gtk_icon_theme_get_default();
  info = gtk_icon_theme_lookup_by_gicon (theme, icon, emblem_size,
                                         GTK_ICON_LOOKUP_FORCE_SIZE);
  pixbuf = gtk_icon_info_load_symbolic_for_context (info, style, NULL, NULL);

  gtk_icon_info_free (info);
  g_object_unref (icon);
  g_free (symbolic_name);

  if (pixbuf == NULL)
    goto out;

  gtk_render_icon (style, cr, pixbuf, (total_size - emblem_size) / 2,  (total_size - emblem_size) / 2);
  g_object_unref (pixbuf);

  retval = G_ICON (gdk_pixbuf_get_from_surface (surface, 0, 0, total_size, total_size));

 out:
  g_object_unref (style);
  cairo_surface_destroy (surface);
  cairo_destroy (cr);

  return retval;
}
