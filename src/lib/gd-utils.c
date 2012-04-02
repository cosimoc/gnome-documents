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
#include <math.h>

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
  return gtk_list_store_new (7,
                             G_TYPE_STRING, // URN
                             G_TYPE_STRING, // URI
                             G_TYPE_STRING, // TITLE
                             G_TYPE_STRING, // AUTHOR
                             GDK_TYPE_PIXBUF, // ICON
                             G_TYPE_LONG, // MTIME
                             G_TYPE_BOOLEAN); // SELECTED
}

void
gd_store_set (GtkListStore *store,
              GtkTreeIter *iter,
              const gchar *urn,
              const gchar *uri,
              const gchar *title,
              const gchar *author,
              GdkPixbuf *icon,
              glong mtime)
{
  gtk_list_store_set (store, iter,
                      0, urn,
                      1, uri,
                      2, title,
                      3, author,
                      4, icon,
                      5, mtime,
                      -1);
}

/**
 * gd_create_item_store:
 * 
 * Returns: (transfer full):
 */
GtkListStore *
gd_create_item_store (void)
{
  return gtk_list_store_new (3,
                             G_TYPE_STRING, // ID
                             G_TYPE_STRING, // NAME
                             G_TYPE_STRING); // HEADING_TEXT
}

void
gd_item_store_set (GtkListStore *store,
                   GtkTreeIter *iter,
                   const gchar *id,
                   const gchar *name,
                   const gchar *heading_text)
{
  gtk_list_store_set (store, iter,
                      0, id,
                      1, name,
                      2, heading_text,
                      -1);
}

/**
 * gd_create_organize_store:
 * 
 * Returns: (transfer full):
 */
GtkListStore *
gd_create_organize_store (void)
{
  return gtk_list_store_new (3,
                             G_TYPE_STRING, // ID
                             G_TYPE_STRING, // NAME
                             G_TYPE_INT); // STATE
}

void
gd_organize_store_set (GtkListStore *store,
                       GtkTreeIter *iter,
                       const gchar *id,
                       const gchar *name,
                       gint state)
{
  gtk_list_store_set (store, iter,
                      0, id,
                      1, name,
                      2, state,
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

/**
 * gd_embed_image_in_frame: 
 * @source_image:
 * @frame_image_path:
 * @slice_width:
 * @border_width:
 *
 * Returns: (transfer full):
 */
GdkPixbuf *
gd_embed_image_in_frame (GdkPixbuf *source_image,
                         const gchar *frame_image_path,
                         GtkBorder *slice_width,
                         GtkBorder *border_width)
{
  cairo_surface_t *surface;
  cairo_t *cr;
  int source_width, source_height;
  int dest_width, dest_height;
  gchar *css_str;
  GtkCssProvider *provider;
  GtkStyleContext *context;
  GError *error = NULL;
  GdkPixbuf *retval;
  GtkWidgetPath *path;
 
  source_width = gdk_pixbuf_get_width (source_image);
  source_height = gdk_pixbuf_get_height (source_image);

  dest_width = source_width +  border_width->left + border_width->right;
  dest_height = source_height + border_width->top + border_width->bottom;

  css_str = g_strdup_printf (".embedded-image { border-image: url(\"%s\") %d %d %d %d / %d %d %d %d }",
                             frame_image_path, 
                             slice_width->top, slice_width->right, slice_width->bottom, slice_width->left,
                             border_width->top, border_width->right, border_width->bottom, border_width->left);
  provider = gtk_css_provider_new ();
  gtk_css_provider_load_from_data (provider, css_str, -1, &error);

  if (error != NULL) 
    {
      g_warning ("Unable to create the thumbnail frame image: %s", error->message);
      g_error_free (error);
      g_free (css_str);

      return g_object_ref (source_image);
    }

  surface = cairo_image_surface_create (CAIRO_FORMAT_ARGB32, dest_width, dest_height);
  cr = cairo_create (surface);

  context = gtk_style_context_new ();
  path = gtk_widget_path_new ();
  gtk_widget_path_append_type (path, GTK_TYPE_ICON_VIEW);

  gtk_style_context_set_path (context, path);
  gtk_style_context_add_provider (context, GTK_STYLE_PROVIDER (provider), 600);

  gtk_style_context_save (context);
  gtk_style_context_add_class (context, "embedded-image");

  gtk_render_frame (context, cr,
                    0, 0,
                    dest_width, dest_height);

  gtk_style_context_restore (context);

  gtk_render_icon (context, cr,
                   source_image,
                   border_width->left, border_width->top);

  retval = gdk_pixbuf_get_from_surface (surface,
                                        0, 0, dest_width, dest_height);

  cairo_surface_destroy (surface);
  cairo_destroy (cr);

  gtk_widget_path_unref (path);
  g_object_unref (provider);
  g_object_unref (context);
  g_free (css_str);

  return retval;
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
 * @string: (allow-none):
 * @timeval: (out):
 *
 * Returns:
 */
gboolean
gd_time_val_from_iso8601 (const gchar *string,
                          GTimeVal *timeval)
{
  if (string == NULL)
    g_get_current_time (timeval);

  return g_time_val_from_iso8601 (string, timeval);
}

/**
 * gd_iso8601_from_timestamp:
 * @timestamp:
 *
 * Returns: (transfer full):
 */
gchar *
gd_iso8601_from_timestamp (gint64 timestamp)
{
  GTimeVal tv;

  tv.tv_sec = timestamp;
  tv.tv_usec = 0;
  return g_time_val_to_iso8601 (&tv);
}

/**
 * gd_create_collection_icon:
 * @base_size:
 * @pixbufs: (element-type GdkPixbuf):
 *
 * Returns: (transfer full):
 */
GIcon *
gd_create_collection_icon (gint base_size,
                           GList *pixbufs)
{
  cairo_surface_t *surface;
  GIcon *retval;
  cairo_t *cr;
  GtkStyleContext *context;
  GtkWidgetPath *path;
  gint padding, tile_size, scale_size;
  gint pix_width, pix_height;
  gint idx, cur_x, cur_y;
  GList *l;
  GdkPixbuf *pix;

  /* TODO: do not hardcode 4, but scale to another layout if more
   * pixbufs are provided.
   */

  padding = MAX (floor (base_size / 10), 4);
  tile_size = (base_size - (3 * padding)) / 2;

  context = gtk_style_context_new ();
  gtk_style_context_add_class (context, "documents-collection-icon");

  path = gtk_widget_path_new ();
  gtk_widget_path_append_type (path, GTK_TYPE_ICON_VIEW);
  gtk_style_context_set_path (context, path);
  gtk_widget_path_unref (path);

  surface = cairo_image_surface_create (CAIRO_FORMAT_ARGB32, base_size, base_size);
  cr = cairo_create (surface);

  gtk_render_background (context, cr,
                         0, 0, base_size, base_size);

  l = pixbufs;
  idx = 0;
  cur_x = padding;
  cur_y = padding;

  while (l != NULL && idx < 4)
    {
      pix = l->data;
      pix_width = gdk_pixbuf_get_width (pix);
      pix_height = gdk_pixbuf_get_height (pix);

      scale_size = MIN (pix_width, pix_height);

      cairo_save (cr);

      cairo_translate (cr, cur_x, cur_y);

      cairo_rectangle (cr, 0, 0,
                       tile_size, tile_size);
      cairo_clip (cr);

      cairo_scale (cr, (gdouble) tile_size / (gdouble) scale_size, (gdouble) tile_size / (gdouble) scale_size);
      gdk_cairo_set_source_pixbuf (cr, pix, 0, 0);

      cairo_paint (cr);
      cairo_restore (cr);

      if ((idx % 2) == 0)
        {
          cur_x += tile_size + padding;
        }
      else
        {
          cur_x = padding;
          cur_y += tile_size + padding;
        }

      idx++;
      l = l->next;
    }

  retval = G_ICON (gdk_pixbuf_get_from_surface (surface, 0, 0, base_size, base_size));

  cairo_surface_destroy (surface);
  cairo_destroy (cr);
  g_object_unref (context);

  return retval;
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
  icon = g_themed_icon_new_with_default_fallbacks (symbolic_name);
  g_free (symbolic_name);

  theme = gtk_icon_theme_get_default();
  info = gtk_icon_theme_lookup_by_gicon (theme, icon, emblem_size,
                                         GTK_ICON_LOOKUP_FORCE_SIZE);
  g_object_unref (icon);

  if (info == NULL)
    goto out;

  pixbuf = gtk_icon_info_load_symbolic_for_context (info, style, NULL, NULL);
  gtk_icon_info_free (info);

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

/* taken from gtk/gtktreeview.c */
static void
send_focus_change (GtkWidget *widget,
                   GdkDevice *device,
		   gboolean   in)
{
  GdkDeviceManager *device_manager;
  GList *devices, *d;

  device_manager = gdk_display_get_device_manager (gtk_widget_get_display (widget));
  devices = gdk_device_manager_list_devices (device_manager, GDK_DEVICE_TYPE_MASTER);
  devices = g_list_concat (devices, gdk_device_manager_list_devices (device_manager, GDK_DEVICE_TYPE_SLAVE));
  devices = g_list_concat (devices, gdk_device_manager_list_devices (device_manager, GDK_DEVICE_TYPE_FLOATING));

  for (d = devices; d; d = d->next)
    {
      GdkDevice *dev = d->data;
      GdkEvent *fevent;
      GdkWindow *window;

      if (gdk_device_get_source (dev) != GDK_SOURCE_KEYBOARD)
        continue;

      window = gtk_widget_get_window (widget);

      /* Skip non-master keyboards that haven't
       * selected for events from this window
       */
      if (gdk_device_get_device_type (dev) != GDK_DEVICE_TYPE_MASTER &&
          !gdk_window_get_device_events (window, dev))
        continue;

      fevent = gdk_event_new (GDK_FOCUS_CHANGE);

      fevent->focus_change.type = GDK_FOCUS_CHANGE;
      fevent->focus_change.window = g_object_ref (window);
      fevent->focus_change.in = in;
      gdk_event_set_device (fevent, device);

      gtk_widget_send_focus_change (widget, fevent);

      gdk_event_free (fevent);
    }

  g_list_free (devices);
}

void
gd_entry_focus_hack (GtkWidget *entry,
                     GdkDevice *device)
{
  GtkEntryClass *entry_class;
  GtkWidgetClass *entry_parent_class;

  /* Grab focus will select all the text.  We don't want that to happen, so we
   * call the parent instance and bypass the selection change.  This is probably
   * really non-kosher. */
  entry_class = g_type_class_peek (GTK_TYPE_ENTRY);
  entry_parent_class = g_type_class_peek_parent (entry_class);
  (entry_parent_class->grab_focus) (entry);

  /* send focus-in event */
  send_focus_change (entry, device, TRUE);
}

/**
 * gd_create_variant_from_pixbuf:
 * @pixbuf:
 *
 * Returns: (transfer full):
 */
GVariant *
gd_create_variant_from_pixbuf (GdkPixbuf *pixbuf)
{
  GVariant *variant;
  guchar *data;
  guint   length;

  data = gdk_pixbuf_get_pixels_with_length (pixbuf, &length);
  variant = g_variant_new ("(iiibii@ay)",
                           gdk_pixbuf_get_width (pixbuf),
                           gdk_pixbuf_get_height (pixbuf),
                           gdk_pixbuf_get_rowstride (pixbuf),
                           gdk_pixbuf_get_has_alpha (pixbuf),
                           gdk_pixbuf_get_bits_per_sample (pixbuf),
                           gdk_pixbuf_get_n_channels (pixbuf),
                           g_variant_new_from_data (G_VARIANT_TYPE_BYTESTRING,
                                                    data, length, TRUE,
                                                    (GDestroyNotify)g_object_unref,
                                                    g_object_ref (pixbuf)));
  return g_variant_ref_sink (variant);
}

/**
 * gd_format_int_alternative_output:
 * @intval:
 *
 * Returns: (transfer full):
 */
gchar *
gd_format_int_alternative_output (gint intval)
{
  return g_strdup_printf ("%Id", intval);
}
