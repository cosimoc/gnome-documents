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

#ifndef _GD_FRAMED_PIXBUF_RENDERER_H
#define _GD_FRAMED_PIXBUF_RENDERER_H

#include <glib-object.h>

#include <gtk/gtk.h>

G_BEGIN_DECLS

#define GD_TYPE_FRAMED_PIXBUF_RENDERER gd_framed_pixbuf_renderer_get_type()

#define GD_FRAMED_PIXBUF_RENDERER(obj) \
  (G_TYPE_CHECK_INSTANCE_CAST ((obj), \
   GD_TYPE_FRAMED_PIXBUF_RENDERER, GdFramedPixbufRenderer))

#define GD_FRAMED_PIXBUF_RENDERER_CLASS(klass) \
  (G_TYPE_CHECK_CLASS_CAST ((klass), \
   GD_TYPE_FRAMED_PIXBUF_RENDERER, GdFramedPixbufRendererClass))

#define GD_IS_FRAMED_PIXBUF_RENDERER(obj) \
  (G_TYPE_CHECK_INSTANCE_TYPE ((obj), \
   GD_TYPE_FRAMED_PIXBUF_RENDERER))

#define GD_IS_FRAMED_PIXBUF_RENDERER_CLASS(klass) \
  (G_TYPE_CHECK_CLASS_TYPE ((klass), \
   GD_TYPE_FRAMED_PIXBUF_RENDERER))

#define GD_FRAMED_PIXBUF_RENDERER_GET_CLASS(obj) \
  (G_TYPE_INSTANCE_GET_CLASS ((obj), \
   GD_TYPE_FRAMED_PIXBUF_RENDERER, GdFramedPixbufRendererClass))

typedef struct _GdFramedPixbufRenderer GdFramedPixbufRenderer;
typedef struct _GdFramedPixbufRendererClass GdFramedPixbufRendererClass;
typedef struct _GdFramedPixbufRendererPrivate GdFramedPixbufRendererPrivate;

struct _GdFramedPixbufRenderer
{
  GtkCellRendererPixbuf parent;

  GdFramedPixbufRendererPrivate *priv;
};

struct _GdFramedPixbufRendererClass
{
  GtkCellRendererPixbufClass parent_class;
};

GType gd_framed_pixbuf_renderer_get_type (void) G_GNUC_CONST;

GdFramedPixbufRenderer *gd_framed_pixbuf_renderer_new (void);

G_END_DECLS

#endif /* _GD_FRAMED_PIXBUF_RENDERER_H */
