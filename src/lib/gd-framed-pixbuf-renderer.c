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

#include "gd-framed-pixbuf-renderer.h"
#include <string.h>

G_DEFINE_TYPE (GdFramedPixbufRenderer, gd_framed_pixbuf_renderer, GTK_TYPE_CELL_RENDERER_PIXBUF)

static void
gd_framed_pixbuf_renderer_get_size (GtkCellRenderer      *cell,
                                    GtkWidget            *widget,
                                    const GdkRectangle   *cell_area,
                                    gint                 *x_offset,
                                    gint                 *y_offset,
                                    gint                 *width,
                                    gint                 *height)

{
  GTK_CELL_RENDERER_CLASS (gd_framed_pixbuf_renderer_parent_class)->get_size (cell, widget,
                                                                              cell_area,
                                                                              x_offset, y_offset,
                                                                              width, height);

  *width += 2;
  *height += 2;
}

static void
gd_framed_pixbuf_renderer_render (GtkCellRenderer      *cell,
                                  cairo_t              *cr,
                                  GtkWidget            *widget,
                                  const GdkRectangle   *background_area,
                                  const GdkRectangle   *cell_area,
                                  GtkCellRendererState  flags)
{
  GtkStyleContext *context;

  context = gtk_widget_get_style_context (widget);
  gtk_style_context_save (context);
  gtk_style_context_add_class (context, "shadowed");

  GTK_CELL_RENDERER_CLASS (gd_framed_pixbuf_renderer_parent_class)->render(cell, cr,
                                                                           widget, background_area,
                                                                           cell_area, flags);

  gtk_style_context_restore (context);
}

static void
gd_framed_pixbuf_renderer_class_init (GdFramedPixbufRendererClass *klass)
{
  GtkCellRendererClass *cclass = GTK_CELL_RENDERER_CLASS (klass);

  cclass->render = gd_framed_pixbuf_renderer_render;
  cclass->get_size = gd_framed_pixbuf_renderer_get_size;
}

static void
gd_framed_pixbuf_renderer_init (GdFramedPixbufRenderer *self)
{
}

GdFramedPixbufRenderer *
gd_framed_pixbuf_renderer_new (void)
{
  return g_object_new (GD_TYPE_FRAMED_PIXBUF_RENDERER, NULL);
}
