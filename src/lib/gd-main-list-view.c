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

#include "gd-main-list-view.h"
#include "gd-main-view.h"
#include "gd-main-view-generic.h"
#include "gd-two-lines-renderer.h"

#include <glib/gi18n.h>

struct _GdMainListViewPrivate {
  GtkTreeViewColumn *tree_col;
  GtkCellRenderer *selection_cell;
};

static void gd_main_view_generic_iface_init (GdMainViewGenericIface *iface);
G_DEFINE_TYPE_WITH_CODE (GdMainListView, gd_main_list_view, GTK_TYPE_TREE_VIEW,
                         G_IMPLEMENT_INTERFACE (GD_TYPE_MAIN_VIEW_GENERIC,
                                                gd_main_view_generic_iface_init))

static void
on_tree_selection_changed (GtkTreeSelection *selection,
                           gpointer user_data)
{
  GdMainListView *self = user_data;
  g_signal_emit_by_name (self, "view-selection-changed");
}

static void
gd_main_list_view_constructed (GObject *obj)
{
  GdMainListView *self = GD_MAIN_LIST_VIEW (obj);
  GtkCellRenderer *cell;
  GtkTreeSelection *selection;

  G_OBJECT_CLASS (gd_main_list_view_parent_class)->constructed (obj);

  gtk_widget_set_hexpand (GTK_WIDGET (self), TRUE);
  gtk_widget_set_vexpand (GTK_WIDGET (self), TRUE);

  g_object_set (self,
                "headers-visible", FALSE,
                "enable-search", FALSE,
                NULL);

  selection = gtk_tree_view_get_selection (GTK_TREE_VIEW (self));
  gtk_tree_selection_set_mode (selection, GTK_SELECTION_NONE);

  self->priv->tree_col = gtk_tree_view_column_new ();
  gtk_tree_view_append_column (GTK_TREE_VIEW (self), self->priv->tree_col);

  self->priv->selection_cell = cell = gtk_cell_renderer_toggle_new ();
  g_object_set (cell, 
                "visible", FALSE,
                "xpad", 12,
                NULL);
  gtk_tree_view_column_pack_start (self->priv->tree_col, cell, FALSE);
  gtk_tree_view_column_add_attribute (self->priv->tree_col, cell,
                                      "active", GD_MAIN_COLUMN_SELECTED);

  cell = gtk_cell_renderer_pixbuf_new ();
  g_object_set (cell,
                "xalign", 0.5,
                "yalign", 0.5,
                NULL);
  gtk_tree_view_column_pack_start (self->priv->tree_col, cell, FALSE);
  gtk_tree_view_column_add_attribute (self->priv->tree_col, cell,
                                      "pixbuf", GD_MAIN_COLUMN_ICON);

  cell = gd_two_lines_renderer_new ();
  g_object_set (cell,
                "alignment", PANGO_ALIGN_LEFT,
                "wrap-mode", PANGO_WRAP_WORD_CHAR,
                "xpad", 12,
                "text-lines", 2,
                NULL);
  gtk_tree_view_column_pack_start (self->priv->tree_col, cell, FALSE);
  gtk_tree_view_column_add_attribute (self->priv->tree_col, cell,
                                      "text", GD_MAIN_COLUMN_TITLE);
  gtk_tree_view_column_add_attribute (self->priv->tree_col, cell,
                                      "line-two", GD_MAIN_COLUMN_AUTHOR);
}

static void
gd_main_list_view_class_init (GdMainListViewClass *klass)
{
  GObjectClass *oclass = G_OBJECT_CLASS (klass);

  oclass->constructed = gd_main_list_view_constructed;

  g_type_class_add_private (klass, sizeof (GdMainListViewPrivate));
}

static void
gd_main_list_view_init (GdMainListView *self)
{
  self->priv = G_TYPE_INSTANCE_GET_PRIVATE (self, GD_TYPE_MAIN_LIST_VIEW, GdMainListViewPrivate);
}

static GList *
gd_main_list_view_get_selection (GdMainViewGeneric *mv)
{
  GtkTreeSelection *selection;

  selection = gtk_tree_view_get_selection (GTK_TREE_VIEW (mv));
  return gtk_tree_selection_get_selected_rows (selection, NULL);
}

static GtkTreePath *
gd_main_list_view_get_path_at_pos (GdMainViewGeneric *mv,
                                   gint x,
                                   gint y)
{
  GtkTreePath *path = NULL;

  gtk_tree_view_get_path_at_pos (GTK_TREE_VIEW (mv), x, y, &path,
                                 NULL, NULL, NULL);

  return path;
}

static void
gd_main_list_view_set_selection_mode (GdMainViewGeneric *mv,
                                      gboolean selection_mode)
{
  GdMainListView *self = GD_MAIN_LIST_VIEW (mv);

  g_object_set (self->priv->selection_cell,
                "visible", selection_mode,
                NULL);
  gtk_tree_view_column_queue_resize (self->priv->tree_col);
}

static void
gd_main_list_view_scroll_to_path (GdMainViewGeneric *mv,
                                  GtkTreePath *path)
{
  gtk_tree_view_scroll_to_cell (GTK_TREE_VIEW (mv), path, NULL, TRUE, 0.5, 0.5);
}

static gboolean
gd_main_list_view_path_is_selected (GdMainViewGeneric *mv,
                                    GtkTreePath *path)
{
  GtkTreeSelection *selection;

  selection = gtk_tree_view_get_selection (GTK_TREE_VIEW (mv));
  return gtk_tree_selection_path_is_selected (selection, path);
}

static void
gd_main_list_view_select_path (GdMainViewGeneric *mv,
                               GtkTreePath *path)
{
  GtkTreeSelection *selection;

  selection = gtk_tree_view_get_selection (GTK_TREE_VIEW (mv));
  gtk_tree_selection_select_path (selection, path);
}

static void
gd_main_list_view_unselect_path (GdMainViewGeneric *mv,
                                 GtkTreePath *path)
{
  GtkTreeSelection *selection;

  selection = gtk_tree_view_get_selection (GTK_TREE_VIEW (mv));
  gtk_tree_selection_unselect_path (selection, path);
}

static void
gd_main_list_view_set_model (GdMainViewGeneric *mv,
                             GtkTreeModel *model)
{
  gtk_tree_view_set_model (GTK_TREE_VIEW (mv), model);
}

static void
gd_main_view_generic_iface_init (GdMainViewGenericIface *iface)
{
  iface->set_model = gd_main_list_view_set_model;
  iface->get_selection = gd_main_list_view_get_selection;
  iface->get_path_at_pos = gd_main_list_view_get_path_at_pos;
  iface->scroll_to_path = gd_main_list_view_scroll_to_path;
  iface->set_selection_mode = gd_main_list_view_set_selection_mode;
  iface->select_path = gd_main_list_view_select_path;
  iface->unselect_path = gd_main_list_view_unselect_path;
  iface->path_is_selected = gd_main_list_view_path_is_selected;
}

void
gd_main_list_view_add_renderer (GdMainListView *self,
                                GtkCellRenderer *renderer,
                                GtkTreeCellDataFunc func,
                                gpointer user_data,
                                GDestroyNotify destroy)
{
  gtk_tree_view_column_pack_start (self->priv->tree_col, renderer, FALSE);
  gtk_tree_view_column_set_cell_data_func (self->priv->tree_col, renderer,
                                           func, user_data, destroy);
}

GtkWidget *
gd_main_list_view_new (void)
{
  return g_object_new (GD_TYPE_MAIN_LIST_VIEW, NULL);
}
