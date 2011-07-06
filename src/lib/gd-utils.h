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
                   GdkPixbuf *icon);

void gd_store_update_icon (GtkListStore *store,
                           GtkTreeIter *iter,
                           GdkPixbuf *icon);

void gd_queue_thumbnail_job_for_file (GFile *file,
                                      GAsyncReadyCallback callback,
                                      gpointer user_data);

#endif /* __GD_UTILS_H__ */
                                  
