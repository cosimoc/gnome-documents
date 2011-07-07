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

#include "gd-dim-renderer.h"
#include <string.h>

G_DEFINE_TYPE (GdDimRenderer, gd_dim_renderer, GTK_TYPE_CELL_RENDERER_TEXT)

static void
gd_dim_renderer_render (GtkCellRenderer      *cell,
                        cairo_t              *cr,
                        GtkWidget            *widget,
                        const GdkRectangle   *background_area,
                        const GdkRectangle   *cell_area,
                        GtkCellRendererState  flags)
{
  GtkStyleContext *context;

  context = gtk_widget_get_style_context (widget);

  gtk_style_context_save (context);
  gtk_style_context_add_class (context, "dim-label");

  GTK_CELL_RENDERER_CLASS (gd_dim_renderer_parent_class)->render (cell, cr, widget,
                                                                  background_area,
                                                                  cell_area,
                                                                  flags);

  gtk_style_context_restore (context);
}

static void
gd_dim_renderer_class_init (GdDimRendererClass *klass)
{
  GtkCellRendererClass *cell_renderer = GTK_CELL_RENDERER_CLASS (klass);

  cell_renderer->render = gd_dim_renderer_render;
}

static void
gd_dim_renderer_init (GdDimRenderer *self)
{

}

GdDimRenderer *
gd_dim_renderer_new (void)
{
  return g_object_new (GD_TYPE_DIM_RENDERER, NULL);
}
