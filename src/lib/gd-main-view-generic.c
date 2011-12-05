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

#include "gd-main-view-generic.h"

enum {
  VIEW_SELECTION_CHANGED = 1,
  NUM_SIGNALS
};

static guint signals[NUM_SIGNALS] = { 0, };

typedef GdMainViewGenericIface GdMainViewGenericInterface;
G_DEFINE_INTERFACE (GdMainViewGeneric, gd_main_view_generic, GTK_TYPE_WIDGET)

static void
gd_main_view_generic_default_init (GdMainViewGenericInterface *iface)
{
  signals[VIEW_SELECTION_CHANGED] = 
    g_signal_new ("view-selection-changed",
                  GD_TYPE_MAIN_VIEW_GENERIC,
                  G_SIGNAL_RUN_LAST,
                  G_STRUCT_OFFSET (GdMainViewGenericIface, selection_changed),
                  NULL, NULL, NULL,
                  G_TYPE_NONE, 0);
}

/**
 * gd_main_view_generic_set_model:
 * @self:
 * @model: (allow-none):
 *
 */
void
gd_main_view_generic_set_model (GdMainViewGeneric *self,
                        GtkTreeModel *model)
{
  GdMainViewGenericInterface *iface;

  iface = GD_MAIN_VIEW_GENERIC_GET_IFACE (self);

  (* iface->set_model) (self, model);
}

/**
 * gd_main_view_generic_get_selection:
 * @self:
 *
 * Returns: (element-type GtkTreePath) (transfer full):
 */
GList *
gd_main_view_generic_get_selection (GdMainViewGeneric *self)
{
  GdMainViewGenericInterface *iface;

  iface = GD_MAIN_VIEW_GENERIC_GET_IFACE (self);

  return (* iface->get_selection) (self);
}

GtkTreePath *
gd_main_view_generic_get_path_at_pos (GdMainViewGeneric *self,
                                      gint x,
                                      gint y)
{
  GdMainViewGenericInterface *iface;

  iface = GD_MAIN_VIEW_GENERIC_GET_IFACE (self);

  return (* iface->get_path_at_pos) (self, x, y);
}

void
gd_main_view_generic_set_selection_mode (GdMainViewGeneric *self,
                                         GtkSelectionMode mode)
{
  GdMainViewGenericInterface *iface;

  iface = GD_MAIN_VIEW_GENERIC_GET_IFACE (self);

  (* iface->set_selection_mode) (self, mode);
}

void
gd_main_view_generic_scroll_to_path (GdMainViewGeneric *self,
                                     GtkTreePath *path)
{
  GdMainViewGenericInterface *iface;

  iface = GD_MAIN_VIEW_GENERIC_GET_IFACE (self);

  (* iface->scroll_to_path) (self, path);
}

gboolean
gd_main_view_generic_path_is_selected (GdMainViewGeneric *self,
                                       GtkTreePath *path)
{
  GdMainViewGenericInterface *iface;

  iface = GD_MAIN_VIEW_GENERIC_GET_IFACE (self);

  return (* iface->path_is_selected) (self, path);
}

void
gd_main_view_generic_select_path (GdMainViewGeneric *self,
                                  GtkTreePath *path)
{
  GdMainViewGenericInterface *iface;

  iface = GD_MAIN_VIEW_GENERIC_GET_IFACE (self);

  (* iface->select_path) (self, path);
}

void
gd_main_view_generic_unselect_path (GdMainViewGeneric *self,
                                    GtkTreePath *path)
{
  GdMainViewGenericInterface *iface;

  iface = GD_MAIN_VIEW_GENERIC_GET_IFACE (self);

  (* iface->unselect_path) (self, path);
}
