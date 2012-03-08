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

#ifdef HAVE_CONFIG_H
#include "config.h"
#endif

#include "gd-thumb-nav.h"
#include "gd-sidebar-thumbnails.h"

#include <glib.h>
#include <glib/gi18n.h>
#include <glib-object.h>
#include <gtk/gtk.h>
#include <string.h>

#define GD_THUMB_NAV_GET_PRIVATE(object) \
	(G_TYPE_INSTANCE_GET_PRIVATE ((object), GD_TYPE_THUMB_NAV, GdThumbNavPrivate))

G_DEFINE_TYPE (GdThumbNav, gd_thumb_nav, GTK_TYPE_BOX);

#define GD_THUMB_NAV_SCROLL_INC      20
#define GD_THUMB_NAV_SCROLL_MOVE     20
#define GD_THUMB_NAV_SCROLL_TIMEOUT  20

enum
{
	PROP_SHOW_BUTTONS = 1,
	PROP_THUMB_VIEW,
	PROP_MODE
};

struct _GdThumbNavPrivate {
	gboolean          show_buttons;
	gboolean          scroll_dir;
	gint              scroll_pos;
	gint              scroll_id;

	GtkWidget        *button_left;
	GtkWidget        *button_right;
	GtkWidget        *sw;
	GtkWidget        *thumbview;
	GtkAdjustment    *adj;
};

static gboolean
gd_thumb_nav_scroll_event (GtkWidget *widget, GdkEventScroll *event, gpointer user_data)
{
	GdThumbNav *nav = GD_THUMB_NAV (user_data);
	gint inc = GD_THUMB_NAV_SCROLL_INC * 3;
	gdouble upper, page_size, value;
	gdouble delta_x, delta_y;

	switch (event->direction) {
	case GDK_SCROLL_UP:
	case GDK_SCROLL_LEFT:
		inc *= -1;
		break;

	case GDK_SCROLL_DOWN:
	case GDK_SCROLL_RIGHT:
		break;

        case GDK_SCROLL_SMOOTH:
		gdk_event_get_scroll_deltas ((const GdkEvent *) event,
					     &delta_x, &delta_y);

		if (delta_x == 0) {
			/* we only moved in the y direction, look at which direction */
			if (delta_y < 0)
				inc *= -1;
		} else if (delta_x < 0) {
			/* if we moved in the x direction too, ignore the y */
			inc *= -1;
		}

		break;
	default:
		g_assert_not_reached ();
		return FALSE;
	}

	value = gtk_adjustment_get_value (nav->priv->adj);
	upper = gtk_adjustment_get_upper (nav->priv->adj);
	page_size = gtk_adjustment_get_page_size (nav->priv->adj);

	if (inc < 0)
		gtk_adjustment_set_value (nav->priv->adj, MAX (0, value + inc));
	else
		gtk_adjustment_set_value (nav->priv->adj, MIN (upper - page_size, value + inc));

	return TRUE;
}

static void
gd_thumb_nav_adj_changed (GtkAdjustment *adj, gpointer user_data)
{
	GdThumbNav *nav;
	GdThumbNavPrivate *priv;
	gboolean ltr, right_sensitive;
	gdouble value, upper, page_size;

	nav = GD_THUMB_NAV (user_data);
	priv = GD_THUMB_NAV_GET_PRIVATE (nav);
	ltr = gtk_widget_get_direction (priv->sw) == GTK_TEXT_DIR_LTR;

	value = gtk_adjustment_get_value (adj);
	upper = gtk_adjustment_get_upper (adj);
	page_size = gtk_adjustment_get_page_size (adj);

        right_sensitive = (value < upper - page_size);
	gtk_widget_set_sensitive (ltr ? priv->button_right : priv->button_left,
                                  right_sensitive);
}

static void
gd_thumb_nav_adj_value_changed (GtkAdjustment *adj, gpointer user_data)
{
	GdThumbNav *nav;
	GdThumbNavPrivate *priv;
	gboolean ltr, left_sensitive, right_sensitive;
	gdouble value, upper, page_size;

	nav = GD_THUMB_NAV (user_data);
	priv = GD_THUMB_NAV_GET_PRIVATE (nav);
	ltr = gtk_widget_get_direction (priv->sw) == GTK_TEXT_DIR_LTR;

	value = gtk_adjustment_get_value (adj);
	upper = gtk_adjustment_get_upper (adj);
	page_size = gtk_adjustment_get_page_size (adj);

        left_sensitive = (value > 0);
        right_sensitive = (value < upper - page_size);

	gtk_widget_set_sensitive (ltr ? priv->button_left : priv->button_right,
				  left_sensitive);
	gtk_widget_set_sensitive (ltr ? priv->button_right : priv->button_left,
				  right_sensitive);
}

static gboolean
gd_thumb_nav_scroll_step (gpointer user_data)
{
	GdThumbNav *nav = GD_THUMB_NAV (user_data);
	GtkAdjustment *adj = nav->priv->adj;
	gint delta;
	gdouble value, upper, page_size;

	if (nav->priv->scroll_pos < 10)
		delta = GD_THUMB_NAV_SCROLL_INC;
	else if (nav->priv->scroll_pos < 20)
		delta = GD_THUMB_NAV_SCROLL_INC * 2;
	else if (nav->priv->scroll_pos < 30)
		delta = GD_THUMB_NAV_SCROLL_INC * 2 + 5;
	else
		delta = GD_THUMB_NAV_SCROLL_INC * 2 + 12;

	if (!nav->priv->scroll_dir)
		delta *= -1;

	value = gtk_adjustment_get_value (adj);
	upper = gtk_adjustment_get_upper (adj);
	page_size = gtk_adjustment_get_page_size (adj);

	if ((value + delta) >= 0 &&
	    (value + delta) <= (upper - page_size)) {
		gtk_adjustment_set_value (adj, value + delta);
		nav->priv->scroll_pos++;
	} else {
		if (delta > 0)
			gtk_adjustment_set_value (adj, upper - page_size);
		else
			gtk_adjustment_set_value (adj, 0);

		nav->priv->scroll_pos = 0;
		return FALSE;
	}

	return TRUE;
}

static void
gd_thumb_nav_button_clicked (GtkButton *button, GdThumbNav *nav)
{
	nav->priv->scroll_pos = 0;

	nav->priv->scroll_dir = gtk_widget_get_direction (GTK_WIDGET (button)) == GTK_TEXT_DIR_LTR ?
		GTK_WIDGET (button) == nav->priv->button_right :
		GTK_WIDGET (button) == nav->priv->button_left;

	gd_thumb_nav_scroll_step (nav);
}

static void
gd_thumb_nav_start_scroll (GtkButton *button, GdThumbNav *nav)
{
	nav->priv->scroll_dir = gtk_widget_get_direction (GTK_WIDGET (button)) == GTK_TEXT_DIR_LTR ?
		GTK_WIDGET (button) == nav->priv->button_right :
		GTK_WIDGET (button) == nav->priv->button_left;

	nav->priv->scroll_id = g_timeout_add (GD_THUMB_NAV_SCROLL_TIMEOUT,
					      gd_thumb_nav_scroll_step,
					      nav);
}

static void
gd_thumb_nav_stop_scroll (GtkButton *button, GdThumbNav *nav)
{
	if (nav->priv->scroll_id > 0) {
		g_source_remove (nav->priv->scroll_id);
		nav->priv->scroll_id = 0;
		nav->priv->scroll_pos = 0;
	}
}

static void
gd_thumb_nav_get_property (GObject    *object,
			    guint       property_id,
			    GValue     *value,
			    GParamSpec *pspec)
{
	GdThumbNav *nav = GD_THUMB_NAV (object);

	switch (property_id)
	{
	case PROP_SHOW_BUTTONS:
		g_value_set_boolean (value, gd_thumb_nav_get_show_buttons (nav));
		break;

	case PROP_THUMB_VIEW:
		g_value_set_object (value, nav->priv->thumbview);
		break;
	}
}

static void
gd_thumb_nav_set_property (GObject      *object,
			    guint         property_id,
			    const GValue *value,
			    GParamSpec   *pspec)
{
	GdThumbNav *nav = GD_THUMB_NAV (object);

	switch (property_id)
	{
	case PROP_SHOW_BUTTONS:
		gd_thumb_nav_set_show_buttons (nav, g_value_get_boolean (value));
		break;

	case PROP_THUMB_VIEW:
		nav->priv->thumbview =	GTK_WIDGET (g_value_get_object (value));
		break;
	}
}

static void
gd_thumb_nav_constructed (GObject *object)
{
	GdThumbNav *self = GD_THUMB_NAV (object);
	GdThumbNavPrivate *priv = self->priv;

	G_OBJECT_CLASS (gd_thumb_nav_parent_class)->constructed (object);

	if (priv->thumbview != NULL) {
		gtk_container_add (GTK_CONTAINER (priv->sw), priv->thumbview);
		gtk_widget_show_all (priv->sw);

		gtk_icon_view_set_columns (GTK_ICON_VIEW (priv->thumbview),
					   G_MAXINT);

		gtk_widget_set_size_request (priv->thumbview, -1, -1);
		gd_sidebar_thumbnails_set_item_height (GD_SIDEBAR_THUMBNAILS (priv->thumbview),
						       115);

		gtk_scrolled_window_set_policy (GTK_SCROLLED_WINDOW (priv->sw),
						GTK_POLICY_AUTOMATIC,
						GTK_POLICY_NEVER);
	}

        gd_thumb_nav_set_show_buttons (self, priv->show_buttons);
}

static void
gd_thumb_nav_class_init (GdThumbNavClass *class)
{
	GObjectClass *g_object_class = (GObjectClass *) class;

	g_object_class->constructed  = gd_thumb_nav_constructed;
	g_object_class->get_property = gd_thumb_nav_get_property;
	g_object_class->set_property = gd_thumb_nav_set_property;

	g_object_class_install_property (g_object_class,
	                                 PROP_SHOW_BUTTONS,
	                                 g_param_spec_boolean ("show-buttons",
	                                                       "Show Buttons",
	                                                       "Whether to show navigation buttons or not",
	                                                       TRUE,
	                                                       (G_PARAM_READABLE |
								G_PARAM_WRITABLE)));

	g_object_class_install_property (g_object_class,
	                                 PROP_THUMB_VIEW,
	                                 g_param_spec_object ("thumbview",
                                                              "Thumbnail View",
                                                              "The internal thumbnail viewer widget",
                                                              GD_TYPE_SIDEBAR_THUMBNAILS,
                                                              (G_PARAM_CONSTRUCT_ONLY |
                                                               G_PARAM_READABLE |
                                                               G_PARAM_WRITABLE)));

	g_type_class_add_private (g_object_class, sizeof (GdThumbNavPrivate));
}

static void
gd_thumb_nav_init (GdThumbNav *nav)
{
	GdThumbNavPrivate *priv;
	GtkWidget *arrow;

	nav->priv = GD_THUMB_NAV_GET_PRIVATE (nav);

	priv = nav->priv;
	priv->show_buttons = TRUE;

        priv->button_left = gtk_button_new ();
	gtk_button_set_relief (GTK_BUTTON (priv->button_left), GTK_RELIEF_NONE);
	gtk_widget_set_size_request (GTK_WIDGET (priv->button_left), 30, 0);
        gtk_box_pack_start (GTK_BOX (nav), priv->button_left, FALSE, FALSE, 0);

	arrow = gtk_arrow_new (GTK_ARROW_LEFT, GTK_SHADOW_ETCHED_IN);
	gtk_container_add (GTK_CONTAINER (priv->button_left), arrow);

	g_signal_connect (priv->button_left,
			  "clicked",
			  G_CALLBACK (gd_thumb_nav_button_clicked),
			  nav);
	g_signal_connect (priv->button_left,
			  "pressed",
			  G_CALLBACK (gd_thumb_nav_start_scroll),
			  nav);
	g_signal_connect (priv->button_left,
			  "released",
			  G_CALLBACK (gd_thumb_nav_stop_scroll),
			  nav);

	priv->sw = gtk_scrolled_window_new (NULL, NULL);
	gtk_scrolled_window_set_shadow_type (GTK_SCROLLED_WINDOW (priv->sw),
					     GTK_SHADOW_IN);
        gtk_box_pack_start (GTK_BOX (nav), priv->sw, TRUE, TRUE, 0);

	g_signal_connect (priv->sw,
			  "scroll-event",
			  G_CALLBACK (gd_thumb_nav_scroll_event),
			  nav);

	priv->adj = gtk_scrolled_window_get_hadjustment (GTK_SCROLLED_WINDOW (priv->sw));

	g_signal_connect (priv->adj,
			  "changed",
			  G_CALLBACK (gd_thumb_nav_adj_changed),
			  nav);
	g_signal_connect (priv->adj,
			  "value-changed",
			  G_CALLBACK (gd_thumb_nav_adj_value_changed),
			  nav);

        priv->button_right = gtk_button_new ();
	gtk_button_set_relief (GTK_BUTTON (priv->button_right), GTK_RELIEF_NONE);
	gtk_widget_set_size_request (GTK_WIDGET (priv->button_right), 30, 0);
        gtk_box_pack_start (GTK_BOX (nav), priv->button_right, FALSE, FALSE, 0);

	arrow = gtk_arrow_new (GTK_ARROW_RIGHT, GTK_SHADOW_NONE);
	gtk_container_add (GTK_CONTAINER (priv->button_right), arrow);

	g_signal_connect (priv->button_right,
			  "clicked",
			  G_CALLBACK (gd_thumb_nav_button_clicked),
			  nav);
	g_signal_connect (priv->button_right,
			  "pressed",
			  G_CALLBACK (gd_thumb_nav_start_scroll),
			  nav);
	g_signal_connect (priv->button_right,
			  "released",
			  G_CALLBACK (gd_thumb_nav_stop_scroll),
			  nav);

	gtk_adjustment_value_changed (priv->adj);
}

/**
 * gd_thumb_nav_new:
 * @thumbview: an #GdThumbView to embed in the navigation widget.
 * @show_buttons: Whether to show the navigation buttons.
 *
 * Creates a new thumbnail navigation widget.
 *
 * Returns: a new #GdThumbNav object.
 **/
GtkWidget *
gd_thumb_nav_new (GtkWidget       *thumbview,
                  gboolean         show_buttons)
{
	GObject *nav;

	nav = g_object_new (GD_TYPE_THUMB_NAV,
		            "show-buttons", show_buttons,
		            "thumbview", thumbview,
			    NULL);

	return GTK_WIDGET (nav);
}

/**
 * gd_thumb_nav_get_show_buttons:
 * @nav: an #GdThumbNav.
 *
 * Gets whether the navigation buttons are visible.
 *
 * Returns: %TRUE if the navigation buttons are visible,
 * %FALSE otherwise.
 **/
gboolean
gd_thumb_nav_get_show_buttons (GdThumbNav *nav)
{
	g_return_val_if_fail (GD_IS_THUMB_NAV (nav), FALSE);

	return nav->priv->show_buttons;
}

/**
 * gd_thumb_nav_set_show_buttons:
 * @nav: an #GdThumbNav.
 * @show_buttons: %TRUE to show the buttons, %FALSE to hide them.
 *
 * Sets whether the navigation buttons to the left and right of the
 * widget should be visible.
 **/
void
gd_thumb_nav_set_show_buttons (GdThumbNav *nav, gboolean show_buttons)
{
	g_return_if_fail (GD_IS_THUMB_NAV (nav));
	g_return_if_fail (nav->priv->button_left  != NULL);
	g_return_if_fail (nav->priv->button_right != NULL);

	nav->priv->show_buttons = show_buttons;
        gtk_widget_set_visible (nav->priv->button_left, show_buttons);
        gtk_widget_set_visible (nav->priv->button_right, show_buttons);
}
