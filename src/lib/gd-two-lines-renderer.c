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

#include "gd-two-lines-renderer.h"
#include <string.h>

G_DEFINE_TYPE (GdTwoLinesRenderer, gd_two_lines_renderer, GTK_TYPE_CELL_RENDERER_TEXT)

struct _GdTwoLinesRendererPrivate {
  PangoLayout *line_one_layout;
  PangoLayout *line_two_layout;

  gchar *line_two;
  gint text_lines;
};

enum {
  PROP_TEXT_LINES = 1,
  PROP_LINE_TWO,
  NUM_PROPERTIES
};

static GParamSpec *properties[NUM_PROPERTIES] = { NULL, };

static PangoLayout *
create_layout_with_attrs (GtkWidget *widget,
                          GdTwoLinesRenderer *self,
                          PangoEllipsizeMode ellipsize)
{
  PangoLayout *layout;
  gint wrap_width;
  PangoWrapMode wrap_mode;
  PangoAlignment alignment;

  g_object_get (self,
                "wrap-width", &wrap_width,
                "wrap-mode", &wrap_mode,
                "alignment", &alignment,
                NULL);

  layout = pango_layout_new (gtk_widget_get_pango_context (widget));

  pango_layout_set_ellipsize (layout, ellipsize);
  pango_layout_set_wrap (layout, wrap_mode);
  pango_layout_set_alignment (layout, alignment);

  if (wrap_width != -1)
    pango_layout_set_width (layout, wrap_width * PANGO_SCALE);

  return layout;
}

static void
gd_two_lines_renderer_prepare_layouts (GdTwoLinesRenderer *self,
                                       GtkWidget *widget)
{
  gchar *text = NULL;
  gint wrap_width;
  PangoWrapMode wrap_mode;
  PangoAlignment alignment;

  g_object_get (self,
                "text", &text,
                NULL);

  if (self->priv->line_one_layout == NULL)
    self->priv->line_one_layout = 
      create_layout_with_attrs (widget, self, PANGO_ELLIPSIZE_MIDDLE);

  if (self->priv->line_two_layout == NULL)
    self->priv->line_two_layout = 
      create_layout_with_attrs (widget, self, PANGO_ELLIPSIZE_END);

  if (self->priv->line_two == NULL ||
      g_strcmp0 (self->priv->line_two, "") == 0)
    {
      pango_layout_set_height (self->priv->line_one_layout, - (self->priv->text_lines));

      pango_layout_set_text (self->priv->line_one_layout, text, -1);
      pango_layout_set_text (self->priv->line_two_layout, "", -1);
    }
  else
    {
      pango_layout_set_height (self->priv->line_one_layout, - (self->priv->text_lines - 1));
      pango_layout_set_height (self->priv->line_two_layout, -1);

      pango_layout_set_text (self->priv->line_one_layout, text, -1);
      pango_layout_set_text (self->priv->line_two_layout, self->priv->line_two, -1);
    }

  g_free (text);
}

static void
gd_two_lines_renderer_get_size (GtkCellRenderer *cell,
                                GtkWidget *widget,
                                gint *width,
                                gint *height)
{
  GdTwoLinesRenderer *self = GD_TWO_LINES_RENDERER (cell);
  gint layout_w, layout_h, total_w, total_h;
  gint xpad, ypad;

  gd_two_lines_renderer_prepare_layouts (self, widget);

  pango_layout_get_pixel_size (self->priv->line_one_layout, &layout_w, &layout_h);
  total_w = layout_w;
  total_h = layout_h;

  if (self->priv->line_two != NULL &&
      g_strcmp0 (self->priv->line_two, "") != 0)
    {
      pango_layout_get_pixel_size (self->priv->line_two_layout, &layout_w, &layout_h);
      total_w = MAX (total_w, layout_w);
      total_h += layout_h;
    }

  gtk_cell_renderer_get_padding (cell, &xpad, &ypad);
  total_w += 2 * xpad;
  total_h += 2 * ypad;

  if (width != NULL)
    *width = total_w;

  if (height != NULL)
    *height = total_h;
}

static void
gd_two_lines_renderer_render (GtkCellRenderer      *cell,
                              cairo_t              *cr,
                              GtkWidget            *widget,
                              const GdkRectangle   *background_area,
                              const GdkRectangle   *cell_area,
                              GtkCellRendererState  flags)
{
  GdTwoLinesRenderer *self = GD_TWO_LINES_RENDERER (cell);
  GtkStyleContext *context;
  gint line_one_height;
  GtkStateFlags state;
  GdkRectangle render_area = *cell_area;
  guint xpad, ypad;

  context = gtk_widget_get_style_context (widget);
  gd_two_lines_renderer_prepare_layouts (self, widget);

  gtk_cell_renderer_get_padding (cell, &xpad, &ypad);
  render_area.x += xpad;
  render_area.y += ypad;

  gtk_render_layout (context, cr,
                     render_area.x,
                     render_area.y,
                     self->priv->line_one_layout);

  if (self->priv->line_two == NULL ||
      g_strcmp0 (self->priv->line_two, "") == 0)
    return;

  pango_layout_get_pixel_size (self->priv->line_one_layout,
                               NULL, &line_one_height);

  gtk_style_context_save (context);
  gtk_style_context_add_class (context, "dim-label");

  state = gtk_cell_renderer_get_state (cell, widget, flags);
  gtk_style_context_set_state (context, state);

  gtk_render_layout (context, cr,
                     render_area.x,
                     render_area.y + line_one_height,
                     self->priv->line_two_layout);

  gtk_style_context_restore (context);
}

static void
gd_two_lines_renderer_get_preferred_width (GtkCellRenderer *cell,
                                           GtkWidget       *widget,
                                           gint            *minimum_size,
                                           gint            *natural_size)
{
  gint width;

  gd_two_lines_renderer_get_size (cell, widget, &width, NULL);

  if (minimum_size != NULL)
    *minimum_size = width;

  if (natural_size != NULL)
    *natural_size = width;
}

static void
gd_two_lines_renderer_get_preferred_height (GtkCellRenderer *cell,
                                            GtkWidget       *widget,
                                            gint            *minimum_size,
                                            gint            *natural_size)
{
  gint height;

  gd_two_lines_renderer_get_size (cell, widget, NULL, &height);

  if (minimum_size != NULL)
    *minimum_size = height;

  if (natural_size != NULL)
    *natural_size = height;
}

static void
gd_two_lines_renderer_get_preferred_height_for_width (GtkCellRenderer *cell,
                                                      GtkWidget       *widget,
                                                      gint             width,
                                                      gint            *minimum_size,
                                                      gint            *natural_size)
{
  gd_two_lines_renderer_get_preferred_height (cell, widget, minimum_size, natural_size);
}

static void
gd_two_lines_renderer_get_aligned_area (GtkCellRenderer      *cell,
                                        GtkWidget            *widget,
                                        GtkCellRendererState  flags,
                                        const GdkRectangle   *cell_area,
                                        GdkRectangle         *aligned_area)
{
  gd_two_lines_renderer_get_size (cell, widget,
                                  &aligned_area->width, &aligned_area->height);

  aligned_area->x = cell_area->x;
  aligned_area->y = cell_area->y;
}

static void
gd_two_lines_renderer_set_line_two (GdTwoLinesRenderer *self,
                                    const gchar *line_two)
{
  if (g_strcmp0 (self->priv->line_two, line_two) == 0)
    return;

  g_free (self->priv->line_two);
  self->priv->line_two = g_strdup (line_two);

  g_object_notify_by_pspec (G_OBJECT (self), properties[PROP_LINE_TWO]);
}

static void
gd_two_lines_renderer_set_text_lines (GdTwoLinesRenderer *self,
                                      gint text_lines)
{
  if (self->priv->text_lines == text_lines)
    return;

  self->priv->text_lines = text_lines;
  g_object_notify_by_pspec (G_OBJECT (self), properties[PROP_TEXT_LINES]);
}

static void
gd_two_lines_renderer_set_property (GObject    *object,
                                    guint       property_id,
                                    const GValue     *value,
                                    GParamSpec *pspec)
{
  GdTwoLinesRenderer *self = GD_TWO_LINES_RENDERER (object);

  switch (property_id)
    {
    case PROP_TEXT_LINES:
      gd_two_lines_renderer_set_text_lines (self, g_value_get_int (value));
      break;
    case PROP_LINE_TWO:
      gd_two_lines_renderer_set_line_two (self, g_value_get_string (value));
      break;
    default:
      G_OBJECT_WARN_INVALID_PROPERTY_ID (object, property_id, pspec);
      break;
    }
}

static void
gd_two_lines_renderer_get_property (GObject    *object,
                                    guint       property_id,
                                    GValue     *value,
                                    GParamSpec *pspec)
{
  GdTwoLinesRenderer *self = GD_TWO_LINES_RENDERER (object);

  switch (property_id)
    {
    case PROP_TEXT_LINES:
      g_value_set_int (value, self->priv->text_lines);
      break;
    case PROP_LINE_TWO:
      g_value_set_string (value, self->priv->line_two);
      break;
    default:
      G_OBJECT_WARN_INVALID_PROPERTY_ID (object, property_id, pspec);
      break;
    }
}

static void
gd_two_lines_renderer_dispose (GObject *object)
{
  GdTwoLinesRenderer *self = GD_TWO_LINES_RENDERER (object);

  g_clear_object (&self->priv->line_one_layout);
  g_clear_object (&self->priv->line_two_layout);

  G_OBJECT_CLASS (gd_two_lines_renderer_parent_class)->dispose (object);
}

static void
gd_two_lines_renderer_finalize (GObject *object)
{
  GdTwoLinesRenderer *self = GD_TWO_LINES_RENDERER (object);

  g_free (self->priv->line_two);

  G_OBJECT_CLASS (gd_two_lines_renderer_parent_class)->finalize (object);
}

static void
gd_two_lines_renderer_class_init (GdTwoLinesRendererClass *klass)
{
  GtkCellRendererClass *cclass = GTK_CELL_RENDERER_CLASS (klass);
  GObjectClass *oclass = G_OBJECT_CLASS (klass);

  cclass->render = gd_two_lines_renderer_render;
  cclass->get_preferred_width = gd_two_lines_renderer_get_preferred_width;
  cclass->get_preferred_height = gd_two_lines_renderer_get_preferred_height;
  cclass->get_preferred_height_for_width = gd_two_lines_renderer_get_preferred_height_for_width;
  cclass->get_aligned_area = gd_two_lines_renderer_get_aligned_area;

  oclass->set_property = gd_two_lines_renderer_set_property;
  oclass->get_property = gd_two_lines_renderer_get_property;
  oclass->dispose = gd_two_lines_renderer_dispose;
  oclass->finalize = gd_two_lines_renderer_finalize;
  
  properties[PROP_TEXT_LINES] =
    g_param_spec_int ("text-lines",
                      "Lines of text",
                      "The total number of lines to be displayed",
                      2, G_MAXINT, 2,
                      G_PARAM_READWRITE | G_PARAM_STATIC_STRINGS);

  properties[PROP_LINE_TWO] =
    g_param_spec_string ("line-two",
                         "Second line",
                         "Second line",
                         NULL,
                         G_PARAM_READWRITE | G_PARAM_STATIC_STRINGS);

  g_type_class_add_private (klass, sizeof (GdTwoLinesRendererPrivate));
  g_object_class_install_properties (oclass, NUM_PROPERTIES, properties);
}

static void
gd_two_lines_renderer_init (GdTwoLinesRenderer *self)
{
  self->priv = G_TYPE_INSTANCE_GET_PRIVATE (self, GD_TYPE_TWO_LINES_RENDERER,
                                            GdTwoLinesRendererPrivate);
}

GdTwoLinesRenderer *
gd_two_lines_renderer_new (void)
{
  return g_object_new (GD_TYPE_TWO_LINES_RENDERER, NULL);
}
