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

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const ErrorBox = imports.errorBox;
const Global = imports.global;
const LoadMore = imports.loadMore;
const MainToolbar = imports.mainToolbar;
const Preview = imports.preview;
const Searchbar = imports.searchbar;
const Selections = imports.selections;
const SpinnerBox = imports.spinnerBox;
const Tweener = imports.util.tweener;
const View = imports.view;
const WindowMode = imports.windowMode;

const Clutter = imports.gi.Clutter;
const EvView = imports.gi.EvinceView;
const Gd = imports.gi.Gd;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;

const _PDF_LOADER_TIMEOUT = 400;

function ViewEmbed() {
    this._init();
}

ViewEmbed.prototype  = {
    _init: function() {
        this._adjustmentValueId = 0;
        this._adjustmentChangedId = 0;
        this._loaderCancellable = null;
        this._queryErrorId = 0;
        this._scrollbarVisibleId = 0;

        this._scrolledWinView = null;
        this._scrolledWinPreview = null;

        // the embed is a vertical ClutterBox
        this._overlayLayout = new Clutter.BinLayout();
        this.actor = new Clutter.Box({ layout_manager: this._overlayLayout });

        this._contentsLayout = new Clutter.BoxLayout({ vertical: true });
        this._contentsActor = new Clutter.Box({ layout_manager: this._contentsLayout });
        this._overlayLayout.add(this._contentsActor,
            Clutter.BinAlignment.FILL, Clutter.BinAlignment.FILL);

        // pack the toolbar
        this._toolbar = new MainToolbar.OverviewToolbar();
        this._contentsActor.add_actor(this._toolbar.actor);
        this._contentsLayout.set_fill(this._toolbar.actor, true, false);

        // pack the main GtkNotebook and a spinnerbox in a BinLayout, so that
        // we can easily bring them front/back
        this._viewLayout = new Clutter.BinLayout();
        this._viewActor = new Clutter.Box({ layout_manager: this._viewLayout });
        this._contentsLayout.set_expand(this._viewActor, true);
        this._contentsLayout.set_fill(this._viewActor, true, true);
        this._contentsActor.add_actor(this._viewActor);

        this._notebook = new Gtk.Notebook({ show_tabs: false,
                                            show_border: false });
        this._notebook.show();
        this._notebookActor = new GtkClutter.Actor({ contents: this._notebook });
        this._viewLayout.add(this._notebookActor, Clutter.BinAlignment.FILL, Clutter.BinAlignment.FILL);

        this._spinnerBox = new SpinnerBox.SpinnerBox();
        this._viewLayout.add(this._spinnerBox.actor, Clutter.BinAlignment.FILL, Clutter.BinAlignment.FILL);
        this._spinnerBox.actor.lower_bottom();

        // also pack a white background to use for spotlights between window modes
        this._background =
            new Clutter.Rectangle({ color: new Clutter.Color ({ red: 255,
                                                                blue: 255,
                                                                green: 255,
                                                                alpha: 255 }) });
        this._viewLayout.add(this._background,
            Clutter.BinAlignment.FILL, Clutter.BinAlignment.FILL);
        this._background.lower_bottom();

        // create the dropdown for the search bar, it's hidden by default
        this._dropdownBox = new Searchbar.Dropdown();
        this._overlayLayout.add(this._dropdownBox.actor,
            Clutter.BinAlignment.CENTER, Clutter.BinAlignment.FIXED);
        this._dropdownBox.actor.add_constraint(new Clutter.BindConstraint({ source: this._toolbar.toolbarActor,
                                                                            coordinate: Clutter.BindCoordinate.Y }));

        // create the OSD toolbar for selected items, it's hidden by default
        this._selectionToolbar = new Selections.SelectionToolbar();
        let widthConstraint =
            new Clutter.BindConstraint({ source: this._contentsActor,
                                         coordinate: Clutter.BindCoordinate.WIDTH,
                                         offset: - 300 });
        this._selectionToolbar.actor.add_constraint(widthConstraint);
        this._selectionToolbar.actor.connect('notify::width', Lang.bind(this,
            function() {
                let width = this._contentsActor.width;
                let offset = 300;

                if (width > 1000)
                    offset += (width - 1000);
                else if (width < 600)
                    offset -= (600 - width);

                widthConstraint.offset = - offset;
            }));

        this._selectionToolbar.actor.add_constraint(
            new Clutter.AlignConstraint({ align_axis: Clutter.AlignAxis.X_AXIS,
                                          source: this._contentsActor,
                                          factor: 0.50 }));
        this._selectionToolbar.actor.add_constraint(
            new Clutter.AlignConstraint({ align_axis: Clutter.AlignAxis.Y_AXIS,
                                          source: this._contentsActor,
                                          factor: 0.95 }));
        this._overlayLayout.add(this._selectionToolbar.actor,
            Clutter.BinAlignment.FIXED, Clutter.BinAlignment.FIXED);

        // pack the OSD notification actor
        this._viewLayout.add(Global.notificationManager.actor,
            Clutter.BinAlignment.CENTER, Clutter.BinAlignment.START);

        Global.errorHandler.connect('load-error',
                                    Lang.bind(this, this._onLoadError));

        Global.modeController.connect('window-mode-changed',
                                      Lang.bind(this, this._onWindowModeChanged));
        Global.modeController.connect('fullscreen-changed',
                                      Lang.bind(this, this._onFullscreenChanged));
        Global.trackerController.connect('query-status-changed',
                                         Lang.bind(this, this._onQueryStatusChanged));
        Global.documentManager.connect('active-changed',
                                       Lang.bind(this, this._onActiveItemChanged));

        this._onQueryStatusChanged();
    },

    _onQueryStatusChanged: function() {
        let queryStatus = Global.trackerController.getQueryStatus();

        if (queryStatus)
            this._spinnerBox.moveIn();
        else
            this._spinnerBox.moveOut();
    },

    _onFullscreenChanged: function(controller, fullscreen) {
        if (fullscreen) {
            this._previewEmbed = new Preview.PreviewEmbed(this._docModel,
                this._overlayLayout, this._contentsActor, this._scrolledWinPreview);
        } else {
            this._previewEmbed.destroy();
            this._previewEmbed = null;
        }

        Gtk.Settings.get_default().gtk_application_prefer_dark_theme = fullscreen;
        this._toolbar.widget.visible = !fullscreen;
    },

    _moveOutBackground: function() {
        Tweener.addTween(this._background, { opacity: 0,
                                             time: 0.20,
                                             transition: 'easeInQuad',
                                             onComplete: function() {
                                                 this._background.lower_bottom();
                                             },
                                             onCompleteScope: this });
    },

    _windowModeChangeFlash: function() {
        // fade from white when returning to the view anyway
        this._background.raise_top();
        this._background.opacity = 255;
        this._moveOutBackground();
    },

    _onWindowModeChanged: function(object, newMode, oldMode) {
        if (newMode == WindowMode.WindowMode.OVERVIEW)
            this._prepareForOverview();
        else
            this._prepareForPreview();

        if (oldMode != WindowMode.WindowMode.NONE)
            this._windowModeChangeFlash();
    },

    _destroyScrollPreviewChild: function() {
        let child = this._scrolledWinPreview.get_child();
        if (child)
            child.destroy();
    },

    _destroyPreview: function() {
        if (this._loaderCancellable) {
            this._loaderCancellable.cancel();
            this._loaderCancellable = null;
        }

        if (this._preview) {
            this._preview.destroy();
            this._preview = null;
        }

        this._spinnerBox.moveOut();
        this._docModel = null;
    },

    _onActiveItemChanged: function() {
        let doc = Global.documentManager.getActiveItem();

        if (!doc)
            return;

        this._destroyPreview();

        let collection = Global.collectionManager.getItemById(doc.id);

        if (collection) {
            Global.collectionManager.setActiveItem(collection);
            Global.modeController.setWindowMode(WindowMode.WindowMode.OVERVIEW);
            return;
        }

        // switch to preview mode, and schedule the spinnerbox to
        // move in if the document is not loaded by the timeout
        Global.modeController.setWindowMode(WindowMode.WindowMode.PREVIEW);
        this._spinnerBox.moveInDelayed(_PDF_LOADER_TIMEOUT);

        this._loaderCancellable = new Gio.Cancellable();
        doc.load(this._loaderCancellable, Lang.bind(this, this._onDocumentLoaded));
    },

    _onDocumentLoaded: function(doc, evDoc, error) {
        this._loaderCancellable = null;

        if (!evDoc) {
            Global.errorHandler.addLoadError(doc, error);
            return;
        }

        this._docModel = EvView.DocumentModel.new_with_document(evDoc);
        this._toolbar.setModel(this._docModel);

        this._spinnerBox.moveOut();
        Global.modeController.setCanFullscreen(true);
        this._preview = new Preview.PreviewView(this._docModel);

        this._scrolledWinPreview.add(this._preview.widget);
        this._preview.widget.grab_focus();
    },

    _prepareForOverview: function() {
        this._destroyPreview();

        Global.documentManager.setActiveItem(null);

        this._queryErrorId =
            Global.errorHandler.connect('query-error',
                                        Lang.bind(this, this._onQueryError));

        if (!this._scrolledWinView) {
            let grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });
            this._view = new View.View();
            this._scrolledWinView = this._view.widget;
            grid.add(this._scrolledWinView);

            this._loadMore = new LoadMore.LoadMoreButton();
            grid.add(this._loadMore.widget);

            grid.show_all();
            this._viewPage = this._notebook.append_page(grid, null);
        }

        this._adjustmentValueId =
            this._scrolledWinView.vadjustment.connect('value-changed',
                                                      Lang.bind(this, this._onScrolledWinChange));
        this._adjustmentChangedId =
            this._scrolledWinView.vadjustment.connect('changed',
                                                      Lang.bind(this, this._onScrolledWinChange));
        this._scrollbarVisibleId =
            this._scrolledWinView.get_vscrollbar().connect('notify::visible',
                                                           Lang.bind(this, this._onScrolledWinChange));
        this._onScrolledWinChange();

        this._notebook.set_current_page(this._viewPage);
    },

    _onScrolledWinChange: function() {
        let vScrollbar = this._scrolledWinView.get_vscrollbar();
        let adjustment = this._scrolledWinView.vadjustment;
        let revealAreaHeight = 32;

        // if there's no vscrollbar, or if it's not visible, hide the button
        if (!vScrollbar ||
            !vScrollbar.get_visible()) {
            this._loadMore.setBlock(true);
            return;
        }

        let value = adjustment.value;
        let upper = adjustment.upper;
        let page_size = adjustment.page_size;

        let end = false;

        // special case this values which happen at construction
        if ((value == 0) && (upper == 1) && (page_size == 1))
            end = false;
        else
            end = !(value < (upper - page_size - revealAreaHeight));

        this._loadMore.setBlock(!end);
    },

    _onQueryError: function(manager, message, exception) {
        this._prepareForPreview();

        let errorBox = new ErrorBox.ErrorBox(message, exception.message);
        this._scrolledWinPreview.add_with_viewport(errorBox.widget);
    },

    _prepareForPreview: function() {
        if (this._queryErrorId != 0) {
            Global.errorHandler.disconnect(this._queryErrorId);
            this._queryErrorId = 0;
        }

        if (this._adjustmentValueId != 0) {
            this._scrolledWinView.vadjustment.disconnect(this._adjustmentValueId);
            this._adjustmentValueId = 0;
        }
        if (this._adjustmentChangedId != 0) {
            this._scrolledWinView.vadjustment.disconnect(this._adjustmentChangedId);
            this._adjustmentChangedId = 0;
        }
        if (this._scrollbarVisibleId != 0) {
            this._scrolledWinView.get_vscrollbar().disconnect(this._scrollbarVisibleId);
            this._scrollbarVisibleId = 0;
        }

        if (!this._scrolledWinPreview) {
            this._scrolledWinPreview = new Gtk.ScrolledWindow({ hexpand: true,
                                                                vexpand: true,
                                                                shadow_type: Gtk.ShadowType.IN });
            this._scrolledWinPreview.get_style_context().add_class('documents-scrolledwin');
            this._scrolledWinPreview.show();
            this._previewPage = this._notebook.append_page(this._scrolledWinPreview, null);
        } else {
            this._destroyScrollPreviewChild();
        }

        this._notebook.set_current_page(this._previewPage);
    },

    _onLoadError: function(manager, message, exception) {
        this._loaderCancellable = null;
        this._spinnerBox.moveOut();

        let errorBox = new ErrorBox.ErrorBox(message, exception.message);
        this._scrolledWinPreview.add_with_viewport(errorBox.widget);
    }
};
