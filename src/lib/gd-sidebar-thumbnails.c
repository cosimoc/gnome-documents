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

#include <gtk/gtk.h>

#include <evince-document.h>
#include <evince-view.h>

#include "gd-sidebar-thumbnails.h"

#define THUMBNAIL_WIDTH 100

typedef struct _EvThumbsSize
{
	gint width;
	gint height;
} EvThumbsSize;

typedef struct _EvThumbsSizeCache {
	gboolean uniform;
	gint uniform_width;
	gint uniform_height;
	EvThumbsSize *sizes;
} EvThumbsSizeCache;

struct _GdSidebarThumbnailsPrivate {
	GtkListStore *list_store;
	GHashTable *loading_icons;
	EvDocument *document;
	EvDocumentModel *model;
	EvThumbsSizeCache *size_cache;

	GtkCellRenderer *cell_pixbuf;
	gboolean selection_blocked;

	gint n_pages;

	int rotation;
	gboolean inverted_colors;

	/* Visible pages */
	gint start_page, end_page;
};

enum {
	COLUMN_PAGE_STRING,
	COLUMN_PIXBUF,
	COLUMN_THUMBNAIL_SET,
	COLUMN_JOB,
	NUM_COLUMNS
};

enum {
	PROP_MODEL = 1,
	NUM_PROPERTIES
};

static GParamSpec *properties[NUM_PROPERTIES] = { NULL, };

static void         gd_sidebar_thumbnails_clear_model      (GdSidebarThumbnails     *sidebar);
static void         thumbnail_job_completed_callback       (EvJobThumbnail          *job,
							    GdSidebarThumbnails     *sidebar_thumbnails);
static void         adjustment_changed_cb                  (GdSidebarThumbnails     *sidebar_thumbnails);

G_DEFINE_TYPE (GdSidebarThumbnails,  gd_sidebar_thumbnails, GTK_TYPE_ICON_VIEW)

#define GD_SIDEBAR_THUMBNAILS_GET_PRIVATE(object) \
	(G_TYPE_INSTANCE_GET_PRIVATE ((object), GD_TYPE_SIDEBAR_THUMBNAILS, GdSidebarThumbnailsPrivate));

/* Thumbnails dimensions cache */
#define EV_THUMBNAILS_SIZE_CACHE_KEY "ev-thumbnails-size-cache"

static void
get_thumbnail_size_for_page (EvDocument *document,
			     guint       page,
			     gint       *width,
			     gint       *height)
{
	gdouble scale;
	gdouble w, h;

	ev_document_get_page_size (document, page, &w, &h);
	scale = (gdouble)THUMBNAIL_WIDTH / w;

	*width = MAX ((gint)(w * scale + 0.5), 1);
	*height = MAX ((gint)(h * scale + 0.5), 1);
}

static EvThumbsSizeCache *
ev_thumbnails_size_cache_new (EvDocument *document)
{
	EvThumbsSizeCache *cache;
	gint               i, n_pages;
	EvThumbsSize      *thumb_size;

	cache = g_new0 (EvThumbsSizeCache, 1);

	if (ev_document_is_page_size_uniform (document)) {
		cache->uniform = TRUE;
		get_thumbnail_size_for_page (document, 0,
					     &cache->uniform_width,
					     &cache->uniform_height);
		return cache;
	}

	n_pages = ev_document_get_n_pages (document);
	cache->sizes = g_new0 (EvThumbsSize, n_pages);

	for (i = 0; i < n_pages; i++) {
		thumb_size = &(cache->sizes[i]);
		get_thumbnail_size_for_page (document, i,
					     &thumb_size->width,
					     &thumb_size->height);
	}

	return cache;
}

static void
ev_thumbnails_size_cache_get_size (EvThumbsSizeCache *cache,
				   gint               page,
				   gint               rotation,
				   gint              *width,
				   gint              *height)
{
	gint w, h;

	if (cache->uniform) {
		w = cache->uniform_width;
		h = cache->uniform_height;
	} else {
		EvThumbsSize *thumb_size;

		thumb_size = &(cache->sizes[page]);

		w = thumb_size->width;
		h = thumb_size->height;
	}

	if (rotation == 0 || rotation == 180) {
		if (width) *width = w;
		if (height) *height = h;
	} else {
		if (width) *width = h;
		if (height) *height = w;
	}
}

static void
ev_thumbnails_size_cache_free (EvThumbsSizeCache *cache)
{
	if (cache->sizes) {
		g_free (cache->sizes);
		cache->sizes = NULL;
	}

	g_free (cache);
}

static EvThumbsSizeCache *
ev_thumbnails_size_cache_get (EvDocument *document)
{
	EvThumbsSizeCache *cache;

	cache = g_object_get_data (G_OBJECT (document), EV_THUMBNAILS_SIZE_CACHE_KEY);
	if (!cache) {
		cache = ev_thumbnails_size_cache_new (document);
		g_object_set_data_full (G_OBJECT (document),
					EV_THUMBNAILS_SIZE_CACHE_KEY,
					cache,
					(GDestroyNotify)ev_thumbnails_size_cache_free);
	}

	return cache;
}


static void
gd_sidebar_thumbnails_dispose (GObject *object)
{
	GdSidebarThumbnails *self = GD_SIDEBAR_THUMBNAILS (object);
	
	if (self->priv->loading_icons) {
		g_hash_table_destroy (self->priv->loading_icons);
		self->priv->loading_icons = NULL;
	}
	
	if (self->priv->list_store) {
		gd_sidebar_thumbnails_clear_model (self);
		g_object_unref (self->priv->list_store);
		self->priv->list_store = NULL;
	}

        g_clear_object (&self->priv->model);

	G_OBJECT_CLASS (gd_sidebar_thumbnails_parent_class)->dispose (object);
}

static void
gd_sidebar_thumbnails_set_property (GObject *object, 
				    guint prop_id,
				    const GValue *value,
				    GParamSpec *pspec)
{
	GdSidebarThumbnails *self = GD_SIDEBAR_THUMBNAILS (object);

	switch (prop_id) {
	case PROP_MODEL:
		gd_sidebar_thumbnails_set_model (self, g_value_get_object (value));
		break;
	default:
		G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
		break;
	}
}

static void
gd_sidebar_thumbnails_get_property (GObject *object,
				    guint prop_id,
				    GValue *value,
				    GParamSpec *pspec)
{
	GdSidebarThumbnails *self = GD_SIDEBAR_THUMBNAILS (object);

	switch (prop_id) {
	case PROP_MODEL:
		g_value_set_object (value, self->priv->model);
		break;
	default:
		G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
		break;
	}
}

static void
gd_sidebar_thumbnails_parent_set (GtkWidget *widget,
				  GtkWidget *old_parent)
{
	GtkWidget *parent;
	GtkAdjustment *hadjustment, *vadjustment;

	if (GTK_WIDGET_CLASS (gd_sidebar_thumbnails_parent_class)->parent_set) {
		GTK_WIDGET_CLASS (gd_sidebar_thumbnails_parent_class)->parent_set (widget, old_parent);
	}

	parent = gtk_widget_get_parent (widget);
	if (!GTK_IS_SCROLLED_WINDOW (parent)) {
		return;
	}

	hadjustment = gtk_scrolled_window_get_hadjustment (GTK_SCROLLED_WINDOW (parent));
	vadjustment = gtk_scrolled_window_get_vadjustment (GTK_SCROLLED_WINDOW (parent));

	g_signal_connect_data (hadjustment, "value-changed",
			       G_CALLBACK (adjustment_changed_cb),
			       widget, NULL,
			       G_CONNECT_SWAPPED | G_CONNECT_AFTER);
	g_signal_connect_data (vadjustment, "value-changed",
			       G_CALLBACK (adjustment_changed_cb),
			       widget, NULL,
			       G_CONNECT_SWAPPED | G_CONNECT_AFTER);
	g_signal_connect_swapped (parent, "size-allocate",
				  G_CALLBACK (adjustment_changed_cb), widget);	
}

static void
gd_sidebar_thumbnails_constructed (GObject *object)
{
	GdSidebarThumbnails *self = GD_SIDEBAR_THUMBNAILS (object);
	GdSidebarThumbnailsPrivate *priv = self->priv;
        GtkCellRenderer *cell;

	G_OBJECT_CLASS (gd_sidebar_thumbnails_parent_class)->constructed (object);

	cell = priv->cell_pixbuf = gtk_cell_renderer_pixbuf_new ();
	gtk_cell_layout_pack_start (GTK_CELL_LAYOUT (self), cell, FALSE);
	g_object_set (cell,
	              "follow-state", FALSE,
	              "height", 100,
	              "width", 115,
	              "yalign", 0.5,
	              "xalign", 0.5,
	              NULL);
	gtk_cell_layout_set_attributes (GTK_CELL_LAYOUT (self),
					cell,
					"pixbuf", COLUMN_PIXBUF,
					NULL);

	priv->list_store = gtk_list_store_new (NUM_COLUMNS,
					       G_TYPE_STRING,
					       GDK_TYPE_PIXBUF,
					       G_TYPE_BOOLEAN,
					       EV_TYPE_JOB_THUMBNAIL);
	gtk_icon_view_set_model (GTK_ICON_VIEW (self),
				 GTK_TREE_MODEL (priv->list_store));
}

static void
gd_sidebar_thumbnails_selection_changed (GtkIconView *icon_view)
{
	GdSidebarThumbnails *self = GD_SIDEBAR_THUMBNAILS (icon_view);
	GdSidebarThumbnailsPrivate *priv = self->priv;
	GtkTreePath *path;
	GList *selected;
	int page;

	if (priv->selection_blocked) {
		return;
	}

	selected = gtk_icon_view_get_selected_items (icon_view);
	if (selected == NULL)
		return;

	/* We don't handle or expect multiple selection. */
	g_assert (selected->next == NULL);

	path = selected->data;
	page = gtk_tree_path_get_indices (path)[0];

	gtk_tree_path_free (path);
	g_list_free (selected);

	ev_document_model_set_page (priv->model, page);
}

static void
gd_sidebar_thumbnails_class_init (GdSidebarThumbnailsClass *klass)
{
	GObjectClass *oclass = G_OBJECT_CLASS (klass);
	GtkWidgetClass *wclass = GTK_WIDGET_CLASS (klass);
	GtkIconViewClass *ivclass = GTK_ICON_VIEW_CLASS (klass);

	oclass->dispose = gd_sidebar_thumbnails_dispose;
        oclass->set_property = gd_sidebar_thumbnails_set_property;
        oclass->get_property = gd_sidebar_thumbnails_get_property;
        oclass->constructed = gd_sidebar_thumbnails_constructed;

	wclass->parent_set = gd_sidebar_thumbnails_parent_set;

	ivclass->selection_changed = gd_sidebar_thumbnails_selection_changed;

        properties[PROP_MODEL] =
          g_param_spec_object ("model",
                               "model",
                               "The EvDocumentModel",
                               EV_TYPE_DOCUMENT_MODEL,
                               G_PARAM_READWRITE |
                               G_PARAM_STATIC_STRINGS);

	g_type_class_add_private (klass, sizeof (GdSidebarThumbnailsPrivate));
        g_object_class_install_properties (oclass, NUM_PROPERTIES, properties);
}

static GdkPixbuf *
gd_sidebar_thumbnails_get_loading_icon (GdSidebarThumbnails *self,
					gint                 width,
					gint                 height)
{
	GdSidebarThumbnailsPrivate *priv = self->priv;
	GdkPixbuf *icon;
	gchar     *key;

	key = g_strdup_printf ("%dx%d", width, height);
	icon = g_hash_table_lookup (priv->loading_icons, key);
	if (!icon) {
		gboolean inverted_colors;

		inverted_colors = ev_document_model_get_inverted_colors (priv->model);
		icon = ev_document_misc_get_loading_thumbnail (width, height, inverted_colors);
		g_hash_table_insert (priv->loading_icons, key, icon);
	} else {
		g_free (key);
	}
	
	return icon;
}

static void
clear_range (GdSidebarThumbnails *self,
	     gint                 start_page,
	     gint                 end_page)
{
	GdSidebarThumbnailsPrivate *priv = self->priv;
	GtkTreePath *path;
	GtkTreeIter iter;
	gboolean result;
	gint prev_width = -1;
	gint prev_height = -1;

	g_assert (start_page <= end_page);

	path = gtk_tree_path_new_from_indices (start_page, -1);
	for (result = gtk_tree_model_get_iter (GTK_TREE_MODEL (priv->list_store), &iter, path);
	     result && start_page <= end_page;
	     result = gtk_tree_model_iter_next (GTK_TREE_MODEL (priv->list_store), &iter), start_page ++) {
		EvJobThumbnail *job;
		GdkPixbuf *loading_icon = NULL;
		gint width, height;

		gtk_tree_model_get (GTK_TREE_MODEL (priv->list_store),
				    &iter,
				    COLUMN_JOB, &job,
				    -1);

		if (job) {
			g_signal_handlers_disconnect_by_func (job, thumbnail_job_completed_callback, self);
			ev_job_cancel (EV_JOB (job));
			g_object_unref (job);
		}

		ev_thumbnails_size_cache_get_size (priv->size_cache, start_page,
						  priv->rotation,
						  &width, &height);
		if (!loading_icon || (width != prev_width && height != prev_height)) {
			loading_icon =
				gd_sidebar_thumbnails_get_loading_icon (self,
									width, height);
		}

		prev_width = width;
		prev_height = height;

		gtk_list_store_set (priv->list_store, &iter,
				    COLUMN_JOB, NULL,
				    COLUMN_THUMBNAIL_SET, FALSE,
				    COLUMN_PIXBUF, loading_icon,
				    -1);
	}
	gtk_tree_path_free (path);
}

static gdouble
get_scale_for_page (GdSidebarThumbnails *self,
		    gint                 page)
{
	GdSidebarThumbnailsPrivate *priv = self->priv;
	gdouble width;

	ev_document_get_page_size (priv->document, page, &width, NULL);

	return (gdouble)THUMBNAIL_WIDTH / width;
}

static void
add_range (GdSidebarThumbnails *self,
	   gint                 start_page,
	   gint                 end_page)
{
	GdSidebarThumbnailsPrivate *priv = self->priv;
	GtkTreePath *path;
	GtkTreeIter iter;
	gboolean result;
	gint page = start_page;

	g_assert (start_page <= end_page);

	path = gtk_tree_path_new_from_indices (start_page, -1);
	for (result = gtk_tree_model_get_iter (GTK_TREE_MODEL (priv->list_store), &iter, path);
	     result && page <= end_page;
	     result = gtk_tree_model_iter_next (GTK_TREE_MODEL (priv->list_store), &iter), page ++) {
		EvJob *job;
		gboolean thumbnail_set;

		gtk_tree_model_get (GTK_TREE_MODEL (priv->list_store), &iter,
				    COLUMN_JOB, &job,
				    COLUMN_THUMBNAIL_SET, &thumbnail_set,
				    -1);

		if (job == NULL && !thumbnail_set) {
			job = ev_job_thumbnail_new (priv->document,
						    page, priv->rotation,
						    get_scale_for_page (self, page));
			ev_job_scheduler_push_job (EV_JOB (job), EV_JOB_PRIORITY_HIGH);
			
			g_object_set_data_full (G_OBJECT (job), "tree_iter",
						gtk_tree_iter_copy (&iter),
						(GDestroyNotify) gtk_tree_iter_free);
			g_signal_connect (job, "finished",
					  G_CALLBACK (thumbnail_job_completed_callback),
					  self);
			gtk_list_store_set (priv->list_store, &iter,
					    COLUMN_JOB, job,
					    -1);
			
			/* The queue and the list own a ref to the job now */
			g_object_unref (job);
		} else if (job) {
			g_object_unref (job);
		}
	}
	gtk_tree_path_free (path);
}

/* This modifies start */
static void
update_visible_range (GdSidebarThumbnails *self,
		      gint                 start_page,
		      gint                 end_page)
{
	GdSidebarThumbnailsPrivate *priv = self->priv;
	int old_start_page, old_end_page;

	old_start_page = priv->start_page;
	old_end_page = priv->end_page;

	if (start_page == old_start_page &&
	    end_page == old_end_page)
		return;

	/* Clear the areas we no longer display */
	if (old_start_page >= 0 && old_start_page < start_page)
		clear_range (self, old_start_page, MIN (start_page - 1, old_end_page));
	
	if (old_end_page > 0 && old_end_page > end_page)
		clear_range (self, MAX (end_page + 1, old_start_page), old_end_page);

	add_range (self, start_page, end_page);
	
	priv->start_page = start_page;
	priv->end_page = end_page;
}

static void
adjustment_changed_cb (GdSidebarThumbnails *self)
{
	GtkTreePath *path = NULL;
	GtkTreePath *path2 = NULL;

	/* Widget is not currently visible */
	if (!gtk_widget_get_mapped (GTK_WIDGET (self)))
		return;

	if (!gtk_widget_get_realized (GTK_WIDGET (self))) {
		return;
	}
	if (!gtk_icon_view_get_visible_range (GTK_ICON_VIEW (self), &path, &path2)) {
		return;
	}

	if (path && path2) {
		update_visible_range (self,
				      gtk_tree_path_get_indices (path)[0],
				      gtk_tree_path_get_indices (path2)[0]);
	}

	gtk_tree_path_free (path);
	gtk_tree_path_free (path2);
}

static void
gd_sidebar_thumbnails_fill_model (GdSidebarThumbnails *self)
{
	GdSidebarThumbnailsPrivate *priv = self->priv;
	GtkTreeIter iter;
	int i;
	gint prev_width = -1;
	gint prev_height = -1;

	for (i = 0; i < self->priv->n_pages; i++) {
		gchar     *page_label;
		gchar     *page_string;
		GdkPixbuf *loading_icon = NULL;
		gint       width, height;

		page_label = ev_document_get_page_label (priv->document, i);
		page_string = g_markup_printf_escaped ("%s", page_label);
		ev_thumbnails_size_cache_get_size (self->priv->size_cache, i,
						   self->priv->rotation,
						   &width, &height);
		if (!loading_icon || (width != prev_width && height != prev_height)) {
			loading_icon =
				gd_sidebar_thumbnails_get_loading_icon (self,
									width, height);
		}

		prev_width = width;
		prev_height = height;
		
		gtk_list_store_append (priv->list_store, &iter);
		gtk_list_store_set (priv->list_store, &iter,
				    COLUMN_PAGE_STRING, page_string,
				    COLUMN_PIXBUF, loading_icon,
				    COLUMN_THUMBNAIL_SET, FALSE,
				    -1);
		g_free (page_label);
		g_free (page_string);
	}
}

static void
gd_sidebar_thumbnails_init (GdSidebarThumbnails *self)
{
	self->priv = GD_SIDEBAR_THUMBNAILS_GET_PRIVATE (self);
}

static void
gd_sidebar_thumbnails_set_current_page (GdSidebarThumbnails *self,
					gint                 page)
{
	GtkTreePath *path;

	path = gtk_tree_path_new_from_indices (page, -1);

	self->priv->selection_blocked = TRUE;
	gtk_icon_view_select_path (GTK_ICON_VIEW (self), path);
	self->priv->selection_blocked = FALSE;

	gtk_icon_view_scroll_to_path (GTK_ICON_VIEW (self), path, FALSE, 0.0, 0.0);

	gtk_tree_path_free (path);
}

static void
page_changed_cb (GdSidebarThumbnails *self,
		 gint                 old_page,
		 gint                 new_page)
{
	gd_sidebar_thumbnails_set_current_page (self, new_page);
}

static gboolean
refresh (GdSidebarThumbnails *self)
{
	adjustment_changed_cb (self);
	return FALSE;
}

static void
gd_sidebar_thumbnails_reload (GdSidebarThumbnails *self)
{
	EvDocumentModel *model;

	if (self->priv->loading_icons)
		g_hash_table_remove_all (self->priv->loading_icons);

	if (self->priv->document == NULL ||
	    self->priv->n_pages <= 0)
		return;

	model = self->priv->model;

	gd_sidebar_thumbnails_clear_model (self);
	gd_sidebar_thumbnails_fill_model (self);

	/* Trigger a redraw */
	self->priv->start_page = -1;
	self->priv->end_page = -1;
	gd_sidebar_thumbnails_set_current_page (self,
						ev_document_model_get_page (model));
	g_idle_add ((GSourceFunc) refresh, self);
}

static void
gd_sidebar_thumbnails_rotation_changed_cb (EvDocumentModel     *model,
					   GParamSpec          *pspec,
					   GdSidebarThumbnails *self)
{
	gint rotation = ev_document_model_get_rotation (model);

	self->priv->rotation = rotation;
	gd_sidebar_thumbnails_reload (self);
}

static void
gd_sidebar_thumbnails_inverted_colors_changed_cb (EvDocumentModel     *model,
						  GParamSpec          *pspec,
						  GdSidebarThumbnails *self)
{
	gboolean inverted_colors = ev_document_model_get_inverted_colors (model);

	self->priv->inverted_colors = inverted_colors;
	gd_sidebar_thumbnails_reload (self);
}

static void
thumbnail_job_completed_callback (EvJobThumbnail      *job,
				  GdSidebarThumbnails *self)
{
	GdSidebarThumbnailsPrivate *priv = self->priv;
	GtkTreeIter *iter;

	iter = (GtkTreeIter *) g_object_get_data (G_OBJECT (job), "tree_iter");
	if (priv->inverted_colors)
		ev_document_misc_invert_pixbuf (job->thumbnail);
	gtk_list_store_set (priv->list_store,
			    iter,
			    COLUMN_PIXBUF, job->thumbnail,
			    COLUMN_THUMBNAIL_SET, TRUE,
			    COLUMN_JOB, NULL,
			    -1);
}

static void
gd_sidebar_thumbnails_document_changed_cb (EvDocumentModel     *model,
					   GParamSpec          *pspec,
					   GdSidebarThumbnails *self)
{
	EvDocument *document = ev_document_model_get_document (model);
	GdSidebarThumbnailsPrivate *priv = self->priv;

	if (ev_document_get_n_pages (document) <= 0 ||
	    !ev_document_check_dimensions (document)) {
		return;
	}

	priv->size_cache = ev_thumbnails_size_cache_get (document);
	priv->document = document;
	priv->n_pages = ev_document_get_n_pages (document);
	priv->rotation = ev_document_model_get_rotation (model);
	priv->inverted_colors = ev_document_model_get_inverted_colors (model);
	priv->loading_icons = g_hash_table_new_full (g_str_hash,
						     g_str_equal,
						     (GDestroyNotify)g_free,
						     (GDestroyNotify)g_object_unref);

	gd_sidebar_thumbnails_clear_model (self);
	gd_sidebar_thumbnails_fill_model (self);
	gtk_widget_queue_resize (GTK_WIDGET (self));

	/* Connect to the signal and trigger a fake callback */
	g_signal_connect_swapped (priv->model, "page-changed",
				  G_CALLBACK (page_changed_cb),
				  self);
	g_signal_connect (priv->model, "notify::rotation",
			  G_CALLBACK (gd_sidebar_thumbnails_rotation_changed_cb),
			  self);
	g_signal_connect (priv->model, "notify::inverted-colors",
			  G_CALLBACK (gd_sidebar_thumbnails_inverted_colors_changed_cb),
			  self);
	self->priv->start_page = -1;
	self->priv->end_page = -1;
	gd_sidebar_thumbnails_set_current_page (self,
						ev_document_model_get_page (model));
	adjustment_changed_cb (self);
}

static gboolean
gd_sidebar_thumbnails_clear_job (GtkTreeModel *model,                                             
			         GtkTreePath *path,
			         GtkTreeIter *iter,
				 gpointer data)
{
	EvJob *job;
	
	gtk_tree_model_get (model, iter, COLUMN_JOB, &job, -1);
	
	if (job != NULL) {
		ev_job_cancel (job);
		g_signal_handlers_disconnect_by_func (job, thumbnail_job_completed_callback, data);
		g_object_unref (job);
	}
	
	return FALSE;    
}

static void 
gd_sidebar_thumbnails_clear_model (GdSidebarThumbnails *self)
{
	GdSidebarThumbnailsPrivate *priv = self->priv;
	
	gtk_tree_model_foreach (GTK_TREE_MODEL (priv->list_store), 
				gd_sidebar_thumbnails_clear_job, self);
	gtk_list_store_clear (priv->list_store);
}

void
gd_sidebar_thumbnails_set_item_height (GdSidebarThumbnails *self,
				       gint item_height)
{
	GdSidebarThumbnailsPrivate *priv = self->priv;

	g_object_set (priv->cell_pixbuf,
		      "height", item_height,
		      NULL);
}

void
gd_sidebar_thumbnails_set_model (GdSidebarThumbnails *self,
				 EvDocumentModel *model)
{
	GdSidebarThumbnailsPrivate *priv = self->priv;

	if (priv->model == model)
		return;

	priv->model = g_object_ref (model);
	g_signal_connect (model, "notify::document",
			  G_CALLBACK (gd_sidebar_thumbnails_document_changed_cb),
			  self);

	gd_sidebar_thumbnails_document_changed_cb (model, NULL, self);
}

GtkWidget *
gd_sidebar_thumbnails_new (void)
{
	return g_object_new (GD_TYPE_SIDEBAR_THUMBNAILS, NULL);
}
