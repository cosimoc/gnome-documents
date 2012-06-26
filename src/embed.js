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

const ViewEmbed = new Lang.Class({
    Name: 'ViewEmbed',

    _init: function() {
        this._adjustmentValueId = 0;
        this._adjustmentChangedId = 0;
        this._loaderCancellable = null;
        this._queryErrorId = 0;
        this._scrollbarVisibleId = 0;

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

        this._errorBox = new ErrorBox.ErrorBox();
        this._viewLayout.add(this._errorBox.actor, Clutter.BinAlignment.FILL, Clutter.BinAlignment.FILL);
        this._errorBox.actor.lower_bottom();

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
        this._selectionToolbar = new Selections.SelectionToolbar(this._contentsActor);
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

        if (queryStatus) {
            this._errorBox.moveOut();
            this._spinnerBox.moveIn();
        } else {
            this._spinnerBox.moveOut();
        }
    },

    _onFullscreenChanged: function(controller, fullscreen) {
        if (fullscreen) {
            this._previewEmbed = new Preview.PreviewEmbed(this._preview, this._overlayLayout, this._contentsActor);
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

    _onActiveItemChanged: function() {
        let doc = Global.documentManager.getActiveItem();

        if (!doc)
            return;

        let collection = Global.collectionManager.getItemById(doc.id);
        if (collection) {
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

    _onDocumentLoaded: function(doc, docModel, error) {
        this._loaderCancellable = null;

        if (!docModel) {
            return;
        }

        this._toolbar.setModel(docModel);
        this._preview.setModel(docModel);
        this._preview.widget.grab_focus();

        this._spinnerBox.moveOut();
        Global.modeController.setCanFullscreen(true);
    },

    _prepareForOverview: function() {
        if (this._preview)
            this._preview.setModel(null);

        if (this._loaderCancellable) {
            this._loaderCancellable.cancel();
            this._loaderCancellable = null;
        }

        this._spinnerBox.moveOut();
        this._errorBox.moveOut();

        if (!this._view) {
            let grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });
            this._view = new View.View();
            grid.add(this._view.widget);

            this._loadMore = new LoadMore.LoadMoreButton();
            grid.add(this._loadMore.widget);

            grid.show_all();
            this._viewPage = this._notebook.append_page(grid, null);
        }

        this._queryErrorId =
            Global.errorHandler.connect('query-error',
                                        Lang.bind(this, this._onQueryError));
        this._adjustmentValueId =
            this._view.widget.vadjustment.connect('value-changed',
                                                  Lang.bind(this, this._onScrolledWinChange));
        this._adjustmentChangedId =
            this._view.widget.vadjustment.connect('changed',
                                                  Lang.bind(this, this._onScrolledWinChange));
        this._scrollbarVisibleId =
            this._view.widget.get_vscrollbar().connect('notify::visible',
                                                       Lang.bind(this, this._onScrolledWinChange));
        this._onScrolledWinChange();

        this._notebook.set_current_page(this._viewPage);
    },

    _onScrolledWinChange: function() {
        let vScrollbar = this._view.widget.get_vscrollbar();
        let adjustment = this._view.widget.vadjustment;
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
        this._setError(message, exception.message);
    },

    _prepareForPreview: function() {
        if (this._queryErrorId != 0) {
            Global.errorHandler.disconnect(this._queryErrorId);
            this._queryErrorId = 0;
        }

        if (this._adjustmentValueId != 0) {
            this._view.widget.vadjustment.disconnect(this._adjustmentValueId);
            this._adjustmentValueId = 0;
        }
        if (this._adjustmentChangedId != 0) {
            this._view.widget.vadjustment.disconnect(this._adjustmentChangedId);
            this._adjustmentChangedId = 0;
        }
        if (this._scrollbarVisibleId != 0) {
            this._view.widget.get_vscrollbar().disconnect(this._scrollbarVisibleId);
            this._scrollbarVisibleId = 0;
        }

        if (!this._preview) {
            this._preview = new Preview.PreviewView();
            this._previewPage = this._notebook.append_page(this._preview.widget, null);
        }

        this._notebook.set_current_page(this._previewPage);
    },

    _setError: function(primary, secondary) {
        this._errorBox.update(primary, secondary);
        this._errorBox.moveIn();
    },

    _onLoadError: function(manager, message, exception) {
        this._loaderCancellable = null;
        this._spinnerBox.moveOut();

        this._setError(message, exception.message);
    }
});
