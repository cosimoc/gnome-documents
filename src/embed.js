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
const IconView = imports.iconView;
const ListView = imports.listView;
const LoadMore = imports.loadMore;
const MainToolbar = imports.mainToolbar;
const Preview = imports.preview;
const SpinnerBox = imports.spinnerBox;
const Tweener = imports.util.tweener;
const WindowMode = imports.windowMode;

const Clutter = imports.gi.Clutter;
const EvView = imports.gi.EvinceView;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;

const _PDF_LOADER_TIMEOUT = 400;
const _FULLSCREEN_TOOLBAR_TIMEOUT = 2;

function ViewEmbed() {
    this._init();
}

ViewEmbed.prototype  = {
    _init: function() {
        this._adjustmentValueId = 0;
        this._adjustmentChangedId = 0;
        this._loaderCancellable = null;
        this._motionTimeoutId = 0;
        this._queryErrorId = 0;
        this._scrollbarVisibleId = 0;
        this._viewSettingsId = 0;

        this._scrolledWinView = null;
        this._scrolledWinPreview = null;

        // the embed is a vertical ClutterBox
        this._layout = new Clutter.BoxLayout({ vertical: true });
        this.actor = new Clutter.Box({ layout_manager: this._layout });

        // pack the toolbar
        this._toolbar = new MainToolbar.MainToolbar();
        this.actor.add_actor(this._toolbar.actor);
        this._layout.set_fill(this._toolbar.actor, true, false);

        // pack the main GtkNotebook and a spinnerbox in a BinLayout, so that
        // we can easily bring them front/back
        this._embedLayout = new Clutter.BinLayout();
        this._embedActor = new Clutter.Box({ layout_manager: this._embedLayout });
        this._layout.set_expand(this._embedActor, true);
        this._layout.set_fill(this._embedActor, true, true);
        this.actor.add_actor(this._embedActor);

        this._notebook = new Gtk.Notebook({ show_tabs: false });
        this._notebook.show();
        this._notebookActor = new GtkClutter.Actor({ contents: this._notebook });
        this._embedLayout.add(this._notebookActor, Clutter.BinAlignment.FILL, Clutter.BinAlignment.FILL);

        this._spinnerBox = new SpinnerBox.SpinnerBox();
        this._embedLayout.add(this._spinnerBox.actor, Clutter.BinAlignment.FILL, Clutter.BinAlignment.FILL);
        this._spinnerBox.actor.lower_bottom();

        // also pack a white background to use for spotlights between window modes
        this._background =
            new Clutter.Rectangle({ color: new Clutter.Color ({ red: 255,
                                                                blue: 255,
                                                                green: 255,
                                                                alpha: 255 }) });
        this._embedLayout.add(this._background,
            Clutter.BinAlignment.FILL, Clutter.BinAlignment.FILL);
        this._background.lower_bottom();

        Global.errorHandler.connect('load-error',
                                    Lang.bind(this, this._onLoadError));

        Global.modeController.connect('window-mode-changed',
                                      Lang.bind(this, this._onWindowModeChanged));
        Global.modeController.connect('fullscreen-changed',
                                      Lang.bind(this, this._onFullscreenChanged));
        Global.trackerController.connect('query-status-changed',
                                         Lang.bind(this, this._onQueryStatusChanged));

        this._onWindowModeChanged();
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
        this._motionTimeoutId = 0;

        if (fullscreen)
            this._createFullscreenToolbar();
        else
            this._destroyFullscreenToolbar();

        Gtk.Settings.get_default().gtk_application_prefer_dark_theme = fullscreen;
        this._toolbar.widget.visible = !fullscreen;
    },

    _createFullscreenToolbar: function() {
        this._fsToolbar = new MainToolbar.FullscreenToolbar();
        this._fsToolbar.setModel(this._docModel);

        Global.stage.add_actor(this._fsToolbar.actor);

        let vScrollbar = this._scrolledWinPreview.get_vscrollbar();

        let sizeConstraint = new Clutter.BindConstraint
            ({ coordinate: Clutter.BindCoordinate.WIDTH,
               source: Global.stage,
               offset: (vScrollbar.get_visible() ?
                        (- (vScrollbar.get_preferred_width()[1])) : 0 ) });

        // update the constraint size when the scrollbar changes visibility
        vScrollbar.connect('notify::visible',
            function() {
                sizeConstraint.offset = (vScrollbar.get_visible() ?
                                         (- (vScrollbar.get_preferred_width()[1])) : 0 );
            });

        this._fsToolbar.actor.add_constraint(sizeConstraint);
    },

    _destroyFullscreenToolbar: function() {
        this._fsToolbar.destroy();
        this._fsToolbar = null;
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
        let visible = Global.sideFilterController.getSidebarVisible();

        // if the sidebar is visible, wait until it completed fading in before
        // putting back the view
        if (visible) {
            // follow the movement of the sidebar fading the preview to white
            this._background.raise_top();
            Tweener.addTween(this._background,
                { opacity: 255,
                  time: 0.20,
                  transition: 'easeOutQuad',
                  onComplete: function() {
                      this._moveOutBackground();
                  },
                  onCompleteScope: this });
        } else {
            // fade from white when returning to the view anyway
            this._background.raise_top();
            this._background.opacity = 255;
            this._moveOutBackground();
        }
    },

    _onWindowModeChanged: function() {
        let mode = Global.modeController.getWindowMode();

        if (mode == WindowMode.WindowMode.OVERVIEW) {
            let visible = Global.sideFilterController.getSidebarVisible();

            // if the sidebar is visible, wait until it completed fading in before
            // putting back the view
            if (visible) {
                let sidebarInId =
                    Global.sideFilterController.connect('sidebar-in-changed', Lang.bind(this,
                        function() {
                            Global.sideFilterController.disconnect(sidebarInId);
                            this._prepareForOverview();
                        }));
            } else {
                this._prepareForOverview();
            }
        } else {
            this._prepareForPreview();
        }

        this._windowModeChangeFlash();
    },

    _destroyScrollPreviewChild: function() {
        let child = this._scrolledWinPreview.get_child();
        if (child)
            child.destroy();
    },

    _destroyScrollViewChild: function() {
        let child = this._scrolledWinView.get_child();
        if (child)
            child.destroy();
    },

    _initView: function() {
        this._destroyScrollViewChild();

        let isList = Global.settings.get_boolean('list-view');

        if (isList)
            this._view = new ListView.ListView(this);
        else
            this._view = new IconView.IconView(this);

        this._view.connect('item-activated', Lang.bind(this, this._onViewItemActivated));
        this._scrolledWinView.add(this._view.widget);
    },

    _onViewItemActivated: function(view, urn) {
        let doc = Global.documentManager.getItemById(urn);
        Global.documentManager.setActiveItem(doc);

        // switch to preview mode, and schedule the spinnerbox to
        // move in if the document is not loaded by the timeout
        Global.modeController.setWindowMode(WindowMode.WindowMode.PREVIEW);
        this._spinnerBox.moveInDelayed(_PDF_LOADER_TIMEOUT);

        this._loaderCancellable = new Gio.Cancellable();
        doc.loadPreview(this._loaderCancellable, Lang.bind(this, this._onDocumentLoaded));
    },

    _onDocumentLoaded: function(document) {
        this._loaderCancellable = null;
        this._docModel = EvView.DocumentModel.new_with_document(document);

        this._spinnerBox.moveOut();
        Global.modeController.setCanFullscreen(true);
        this._preview = new Preview.PreviewView(this._docModel);

        if (this._fsToolbar)
            this._fsToolbar.setModel(this._docModel);

        this._toolbar.setModel(this._docModel);

        this._preview.widget.connect('motion-notify-event',
                                     Lang.bind(this, this._fullscreenMotionHandler));

        this._scrolledWinPreview.add(this._preview.widget);
        this._preview.widget.grab_focus();
    },

    _fullscreenMotionHandler: function(widget, event) {
        if (!Global.modeController.getFullscreen())
            return false;

        // if we were idle fade in the toolbar, otherwise reset
        // the timeout
        if (this._motionTimeoutId == 0)
            this._fsToolbar.show();
        else
            Mainloop.source_remove(this._motionTimeoutId);

        this._motionTimeoutId = Mainloop.timeout_add_seconds
            (_FULLSCREEN_TOOLBAR_TIMEOUT, Lang.bind(this,
                function() {
                    this._motionTimeoutId = 0;

                    if (this._fsToolbar)
                        this._fsToolbar.hide();

                    return false;
            }));

        return false;
    },

    _prepareForOverview: function() {
        if (this._loaderCancellable) {
            this._loaderCancellable.cancel();
            this._loaderCancellable = null;
        }

        if (this._preview) {
            this._preview.destroy();
            this._preview = null;
        }

        this._docModel = null;

        Global.documentManager.setActiveItem(null);
        this._viewSettingsId =
            Global.settings.connect('changed::list-view',
                                    Lang.bind(this, this._initView));
        this._queryErrorId =
            Global.errorHandler.connect('query-error',
                                        Lang.bind(this, this._onQueryError));

        if (!this._scrolledWinView) {
            let grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });

            this._scrolledWinView = new Gtk.ScrolledWindow({ hexpand: true,
                                                             vexpand: true,
                                                             shadow_type: Gtk.ShadowType.IN });
            this._scrolledWinView.get_style_context().set_junction_sides(Gtk.JunctionSides.BOTTOM);
            grid.add(this._scrolledWinView);

            this._loadMore = new LoadMore.LoadMoreButton();
            grid.add(this._loadMore.widget);

            this._initView();

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
            end = !(adjustment.value < (adjustment.upper - adjustment.page_size));

        this._loadMore.setBlock(!end);
    },

    _onQueryError: function(manager, message, exception) {
        this._destroyScrollViewChild();

        let errorBox = new ErrorBox.ErrorBox(message, exception.message);
        this._scrolledWinView.add_with_viewport(errorBox.widget);
    },

    _prepareForPreview: function() {
        this._view = null;

        if (this._viewSettingsId != 0) {
            Global.settings.disconnect(this._viewSettingsId);
            this._viewSettingsId = 0;
        }

        if (this._queryErrorId != 0) {
            Global.errorHandler.disconnect(this._queryErrorId);
            this._queryErrorId = 0;
        }

        Global.searchFilterController.setSearchVisible(false);

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
