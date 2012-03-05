/*
 * gd-thumb-nav
 * Based on eog-thumb-nav from Eye Of GNOME:
 * http://git.gnome.org/browse/eog/tree/src/eog-thumb-nav.c?id=3.3.91
 *
 * Copyright (C) 2006 The Free Software Foundation
 * Copyright (C) 2012 Red Hat, Inc.
 *
 * Authors: Lucas Rocha <lucasr@gnome.org>
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA 02111-1307, USA.
 */

#ifndef __GD_THUMB_NAV_H__
#define __GD_THUMB_NAV_H__

#include <gtk/gtk.h>
#include <glib.h>
#include <glib-object.h>

G_BEGIN_DECLS

typedef struct _GdThumbNav GdThumbNav;
typedef struct _GdThumbNavClass GdThumbNavClass;
typedef struct _GdThumbNavPrivate GdThumbNavPrivate;

#define GD_TYPE_THUMB_NAV            (gd_thumb_nav_get_type ())
#define GD_THUMB_NAV(obj)            (G_TYPE_CHECK_INSTANCE_CAST((obj), GD_TYPE_THUMB_NAV, GdThumbNav))
#define GD_THUMB_NAV_CLASS(klass)    (G_TYPE_CHECK_CLASS_CAST((klass),  GD_TYPE_THUMB_NAV, GdThumbNavClass))
#define GD_IS_THUMB_NAV(obj)         (G_TYPE_CHECK_INSTANCE_TYPE((obj), GD_TYPE_THUMB_NAV))
#define GD_IS_THUMB_NAV_CLASS(klass) (G_TYPE_CHECK_CLASS_TYPE((klass),  GD_TYPE_THUMB_NAV))
#define GD_THUMB_NAV_GET_CLASS(obj)  (G_TYPE_INSTANCE_GET_CLASS((obj),  GD_TYPE_THUMB_NAV, GdThumbNavClass))

struct _GdThumbNav {
	GtkBox base_instance;

	GdThumbNavPrivate *priv;
};

struct _GdThumbNavClass {
	GtkBoxClass parent_class;
};

GType	         gd_thumb_nav_get_type          (void) G_GNUC_CONST;

GtkWidget       *gd_thumb_nav_new               (GtkWidget         *thumbview,
                                                 gboolean           show_buttons);

gboolean         gd_thumb_nav_get_show_buttons  (GdThumbNav       *nav);

void             gd_thumb_nav_set_show_buttons  (GdThumbNav       *nav,
                                                 gboolean           show_buttons);

G_END_DECLS

#endif /* __GD_THUMB_NAV_H__ */
