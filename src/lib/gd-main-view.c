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

#include "gd-main-view.h"

#include "gd-main-view-generic.h"
#include "gd-main-icon-view.h"
#include "gd-main-list-view.h"

struct _GdMainViewPrivate {
  GdMainViewType current_type;
  gboolean selection_mode;

  GtkWidget *current_view;
  GtkTreeModel *model;
};

enum {
  PROP_VIEW_TYPE = 1,
  PROP_SELECTION_MODE,
  PROP_MODEL,
  NUM_PROPERTIES
};

enum {
  ITEM_ACTIVATED = 1,
  SELECTION_MODE_REQUEST,
  NUM_SIGNALS
};

static GParamSpec *properties[NUM_PROPERTIES] = { NULL, };
static guint signals[NUM_SIGNALS] = { 0, };

G_DEFINE_TYPE (GdMainView, gd_main_view, GTK_TYPE_SCROLLED_WINDOW)

static void
gd_main_view_init (GdMainView *self)
{
  GtkStyleContext *context;

  self->priv = G_TYPE_INSTANCE_GET_PRIVATE (self, GD_TYPE_MAIN_VIEW, GdMainViewPrivate);
  self->priv->current_type = GD_MAIN_VIEW_NONE;

  gtk_widget_set_hexpand (GTK_WIDGET (self), TRUE);
  gtk_widget_set_vexpand (GTK_WIDGET (self), TRUE);
  gtk_scrolled_window_set_shadow_type (GTK_SCROLLED_WINDOW (self), GTK_SHADOW_IN);

  context = gtk_widget_get_style_context (GTK_WIDGET (self));
  gtk_style_context_add_class (context, "documents-scrolledwin");
}

static void
gd_main_view_get_property (GObject    *object,
                           guint       property_id,
                           GValue     *value,
                           GParamSpec *pspec)
{
  GdMainView *self = GD_MAIN_VIEW (object);

  switch (property_id)
    {
    case PROP_VIEW_TYPE:
      g_value_set_int (value, gd_main_view_get_view_type (self));
      break;
    case PROP_SELECTION_MODE:
      g_value_set_boolean (value, gd_main_view_get_selection_mode (self));
      break;
    case PROP_MODEL:
      g_value_set_object (value, gd_main_view_get_model (self));
      break;
    default:
      G_OBJECT_WARN_INVALID_PROPERTY_ID (object, property_id, pspec);
      break;
    }
}

static void
gd_main_view_set_property (GObject    *object,
                           guint       property_id,
                           const GValue *value,
                           GParamSpec *pspec)
{
  GdMainView *self = GD_MAIN_VIEW (object);

  switch (property_id)
    {
    case PROP_VIEW_TYPE:
      gd_main_view_set_view_type (self, g_value_get_int (value));
      break;
    case PROP_SELECTION_MODE:
      gd_main_view_set_selection_mode (self, g_value_get_boolean (value));
      break;
    case PROP_MODEL:
      gd_main_view_set_model (self, g_value_get_object (value));
      break;
    default:
      G_OBJECT_WARN_INVALID_PROPERTY_ID (object, property_id, pspec);
      break;
    }
}

static void
gd_main_view_class_init (GdMainViewClass *klass)
{
  GObjectClass *oclass = G_OBJECT_CLASS (klass);

  oclass->get_property = gd_main_view_get_property;
  oclass->set_property = gd_main_view_set_property;

  properties[PROP_VIEW_TYPE] =
    g_param_spec_int ("view-type",
                      "View type",
                      "View type",
                      GD_MAIN_VIEW_NONE,
                      GD_MAIN_VIEW_LIST,
                      GD_MAIN_VIEW_NONE,
                      G_PARAM_READWRITE |
                      G_PARAM_STATIC_STRINGS);

  properties[PROP_SELECTION_MODE] =
    g_param_spec_boolean ("selection-mode",
                          "Selection mode",
                          "Whether the view is in selection mode",
                          FALSE,
                          G_PARAM_READWRITE |
                          G_PARAM_CONSTRUCT |
                          G_PARAM_STATIC_STRINGS);

  properties[PROP_MODEL] =
    g_param_spec_object ("model",
                         "Model",
                         "The GtkTreeModel",
                         GTK_TYPE_TREE_MODEL,
                         G_PARAM_READWRITE |
                         G_PARAM_CONSTRUCT |
                         G_PARAM_STATIC_STRINGS);

  signals[ITEM_ACTIVATED] =
    g_signal_new ("item-activated",
                  GD_TYPE_MAIN_VIEW,
                  G_SIGNAL_RUN_LAST,
                  0, NULL, NULL, NULL,
                  G_TYPE_NONE, 2,
                  G_TYPE_STRING, 
                  GTK_TYPE_TREE_PATH);

  signals[SELECTION_MODE_REQUEST] =
    g_signal_new ("selection-mode-request",
                  GD_TYPE_MAIN_VIEW,
                  G_SIGNAL_RUN_LAST,
                  0, NULL, NULL, NULL,
                  G_TYPE_NONE, 0);

  g_type_class_add_private (klass, sizeof (GdMainViewPrivate));
  g_object_class_install_properties (oclass, NUM_PROPERTIES, properties);
}

static GdMainViewGeneric *
get_generic (GdMainView *self)
{
  if (self->priv->current_view != NULL)
    return GD_MAIN_VIEW_GENERIC (self->priv->current_view);

  return NULL;
}

static gboolean
on_button_release_selection_mode (GdMainView *self,
                                  GdkEventButton *event,
                                  gboolean entered_mode,
                                  GtkTreePath *path)
{
  GdMainViewGeneric *generic = get_generic (self);
  gboolean selected;

  selected = gd_main_view_generic_path_is_selected (generic, path);

  if (selected && !entered_mode)
    gd_main_view_generic_unselect_path (generic, path);
  else if (!selected)
    gd_main_view_generic_select_path (generic, path);

  return TRUE;
}

static gboolean
on_button_release_view_mode (GdMainView *self,
                             GdkEventButton *event,
                             GtkTreePath *path)
{
  GtkTreeIter iter;
  gchar *id;

  if (self->priv->model == NULL)
    return FALSE;

  if (!gtk_tree_model_get_iter (self->priv->model, &iter, path))
    return FALSE;

  gtk_tree_model_get (self->priv->model, &iter,
                      GD_MAIN_COLUMN_ID, &id,
                      -1);

  g_signal_emit (self, signals[ITEM_ACTIVATED], 0, id, path);
  g_free (id);

  return TRUE;
}

static gboolean
on_button_release_event (GtkWidget *view,
                         GdkEventButton *event,
                         gpointer user_data)
{
  GdMainView *self = user_data;
  GdMainViewGeneric *generic = get_generic (self);
  GtkTreePath *path;
  gboolean entered_mode = FALSE, selection_mode;
  gboolean res;

  /* eat double/triple click events */
  if (event->type != GDK_BUTTON_RELEASE)
    return TRUE;

  path = gd_main_view_generic_get_path_at_pos (generic, event->x, event->y);

  if (path == NULL)
    return FALSE;

  selection_mode = self->priv->selection_mode;

  if (!selection_mode)
    {
      if ((event->button == 3) ||
          (event->button == 1) && (event->state & GDK_CONTROL_MASK))
        {
          g_signal_emit (self, signals[SELECTION_MODE_REQUEST], 0);
          selection_mode = TRUE;
          entered_mode = TRUE;
        }
    }

  if (selection_mode)
    res = on_button_release_selection_mode (self, event, entered_mode, path);
  else
    res = on_button_release_view_mode (self, event, path);

  gtk_tree_path_free (path);
  return res;
}

static gboolean
on_button_press_event (GtkWidget *view,
                       GdkEventButton *event_button,
                       gpointer user_data)
{
  /* TODO: eat button press events for now; in the future we might want
   * to add support for DnD.
   */
  return TRUE;
}

static void
gd_main_view_apply_model (GdMainView *self)
{
  GdMainViewGeneric *generic = get_generic (self);
  gd_main_view_generic_set_model (generic, self->priv->model);
}

static void
gd_main_view_apply_selection_mode (GdMainView *self)
{
  GdMainViewGeneric *generic = get_generic (self);

  if (self->priv->selection_mode)
    gd_main_view_generic_set_selection_mode (generic, GTK_SELECTION_MULTIPLE);
  else
    gd_main_view_generic_set_selection_mode (generic, GTK_SELECTION_NONE);
}

static void
gd_main_view_rebuild (GdMainView *self)
{
  GtkStyleContext *context;

  if (self->priv->current_type == GD_MAIN_VIEW_NONE)
    return;

  if (self->priv->current_view != NULL)
    gtk_widget_destroy (self->priv->current_view);

  if (self->priv->current_type == GD_MAIN_VIEW_ICON)
    self->priv->current_view = gd_main_icon_view_new ();
  else
    self->priv->current_view = gd_main_list_view_new ();

  context = gtk_widget_get_style_context (self->priv->current_view);
  gtk_style_context_add_class (context, "documents-main-view");

  gtk_container_add (GTK_CONTAINER (self), self->priv->current_view);

  g_signal_connect (self->priv->current_view, "button-press-event",
                    G_CALLBACK (on_button_press_event), self);
  g_signal_connect (self->priv->current_view, "button-release-event",
                    G_CALLBACK (on_button_release_event), self);

  gd_main_view_apply_selection_mode (self);
  gd_main_view_apply_model (self);

  gtk_widget_show_all (GTK_WIDGET (self));
}

GdMainView *
gd_main_view_new (GdMainViewType type)
{
  return g_object_new (GD_TYPE_MAIN_VIEW,
                       "view-type", type,
                       NULL);
}

void
gd_main_view_set_view_type (GdMainView *self,
                            GdMainViewType type)
{
  if (type != self->priv->current_type)
    {
      self->priv->current_type = type;
      gd_main_view_rebuild (self);

      g_object_notify_by_pspec (G_OBJECT (self), properties[PROP_VIEW_TYPE]);
    }
}

GdMainViewType
gd_main_view_get_view_type (GdMainView *self)
{
  return self->priv->current_type;
}

void
gd_main_view_set_selection_mode (GdMainView *self,
                                 gboolean selection_mode)
{
  if (selection_mode != self->priv->selection_mode)
    {
      self->priv->selection_mode = selection_mode;
      gd_main_view_apply_selection_mode (self);
      g_object_notify_by_pspec (G_OBJECT (self), properties[PROP_SELECTION_MODE]);
    }
}

GdMainViewType
gd_main_view_get_selection_mode (GdMainView *self)
{
  return self->priv->selection_mode;
}

/**
 * gd_main_view_set_model:
 * @self:
 * @model: (allow-none):
 *
 */
void
gd_main_view_set_model (GdMainView *self,
                        GtkTreeModel *model)
{
  if (model != self->priv->model)
    {
      g_clear_object (&self->priv->model);

      if (model)
        self->priv->model = g_object_ref (model);
      else
        self->priv->model = NULL;

      gd_main_view_apply_model (self);
      g_object_notify_by_pspec (G_OBJECT (self), properties[PROP_MODEL]);
    }
}

/**
 * gd_main_view_get_model:
 * @self:
 *
 * Returns: (transfer none):
 */
GtkTreeModel *
gd_main_view_get_model (GdMainView *self)
{
  return self->priv->model;
}

/**
 * gd_main_view_get_generic_view:
 * @self:
 *
 * Returns: (transfer none):
 */
GtkWidget *
gd_main_view_get_generic_view (GdMainView *self)
{
  return self->priv->current_view;
}
