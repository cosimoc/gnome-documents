/* 
 * gd-sidebar-thumbnails
 * Based on ev-sidebar-thumbnails from Evince:
 * http://git.gnome.org/browse/evince/tree/shell/ev-sidebar-thumbnails.c?id=3.3.90
 *
 * Copyright (C) 2004 Red Hat, Inc.
 * Copyright (C) 2004, 2005 Anders Carlsson <andersca@gnome.org>
 * Copyright (C) 2012 Red Hat, Inc.
 *
 * Authors:
 *   Jonathan Blandford <jrb@alum.mit.edu>
 *   Anders Carlsson <andersca@gnome.org>
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

#ifndef __GD_SIDEBAR_THUMBNAILS_H__
#define __GD_SIDEBAR_THUMBNAILS_H__

#include <gtk/gtk.h>
#include <evince-view.h>

G_BEGIN_DECLS

typedef struct _GdSidebarThumbnails GdSidebarThumbnails;
typedef struct _GdSidebarThumbnailsClass GdSidebarThumbnailsClass;
typedef struct _GdSidebarThumbnailsPrivate GdSidebarThumbnailsPrivate;

#define GD_TYPE_SIDEBAR_THUMBNAILS		(gd_sidebar_thumbnails_get_type())
#define GD_SIDEBAR_THUMBNAILS(object)		(G_TYPE_CHECK_INSTANCE_CAST((object), GD_TYPE_SIDEBAR_THUMBNAILS, GdSidebarThumbnails))
#define GD_SIDEBAR_THUMBNAILS_CLASS(klass)	(G_TYPE_CHECK_CLASS_CAST((klass), GD_TYPE_SIDEBAR_THUMBNAILS, GdSidebarThumbnailsClass))
#define GD_IS_SIDEBAR_THUMBNAILS(object)	(G_TYPE_CHECK_INSTANCE_TYPE((object), GD_TYPE_SIDEBAR_THUMBNAILS))
#define GD_IS_SIDEBAR_THUMBNAILS_CLASS(klass)	(G_TYPE_CHECK_CLASS_TYPE((klass), GD_TYPE_SIDEBAR_THUMBNAILS))
#define GD_SIDEBAR_THUMBNAILS_GET_CLASS(object)	(G_TYPE_INSTANCE_GET_CLASS((object), GD_TYPE_SIDEBAR_THUMBNAILS, GdSidebarThumbnailsClass))

struct _GdSidebarThumbnails {
	GtkIconView base_instance;

	GdSidebarThumbnailsPrivate *priv;
};

struct _GdSidebarThumbnailsClass {
	GtkIconViewClass base_class;
};

GType      gd_sidebar_thumbnails_get_type     (void) G_GNUC_CONST;
GtkWidget *gd_sidebar_thumbnails_new          (void);

void gd_sidebar_thumbnails_set_model (GdSidebarThumbnails *sidebar_thumbnails,
                                      EvDocumentModel *model);
void gd_sidebar_thumbnails_set_item_height (GdSidebarThumbnails *sidebar_thumbnails,
                                            gint item_height);

G_END_DECLS

#endif /* __GD_SIDEBAR_THUMBNAILS_H__ */
