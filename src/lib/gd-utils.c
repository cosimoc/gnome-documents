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
  return gtk_list_store_new (6,
                             G_TYPE_STRING, // URN
                             G_TYPE_STRING, // URI
                             G_TYPE_STRING, // TITLE
                             G_TYPE_STRING, // AUTHOR
                             G_TYPE_STRING, // MTIME
                             GDK_TYPE_PIXBUF); // ICON
}

void
gd_store_set (GtkListStore *store,
              GtkTreeIter *iter,
              const gchar *urn,
              const gchar *uri,
              const gchar *title,
              const gchar *author,
              const gchar *mtime,
              GdkPixbuf *icon)
{
  gtk_list_store_set (store, iter,
                      0, urn,
                      1, uri,
                      2, title,
                      3, author,
                      4, mtime,
                      5, icon,
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
  info = g_file_query_info (file, "standard::content-type,time::modified",
                            0, NULL, NULL);

  mtime = g_file_info_get_attribute_uint64 (info, G_FILE_ATTRIBUTE_TIME_MODIFIED);

  factory = gnome_desktop_thumbnail_factory_new (GNOME_DESKTOP_THUMBNAIL_SIZE_NORMAL);
  pixbuf = gnome_desktop_thumbnail_factory_generate_thumbnail
    (factory, 
     uri, g_file_info_get_content_type (info));

  if (pixbuf != NULL)
    gnome_desktop_thumbnail_factory_save_thumbnail (factory, pixbuf,
                                                    uri, (time_t) mtime);

  g_simple_async_result_complete_in_idle (result);

  g_object_unref (info);
  g_object_unref (file);
  g_object_unref (factory);
  g_object_unref (result);

  if (pixbuf != NULL)
    g_object_unref (pixbuf);

  return FALSE;
}

void
gd_queue_thumbnail_job_for_file (GFile *file,
                                 GAsyncReadyCallback callback,
                                 gpointer user_data)
{
  GSimpleAsyncResult *result;

  result = g_simple_async_result_new (G_OBJECT (file),
                                      callback, user_data, 
                                      gd_queue_thumbnail_job_for_file);

  g_io_scheduler_push_job (create_thumbnail,
                           result, NULL,
                           G_PRIORITY_DEFAULT, NULL);
}