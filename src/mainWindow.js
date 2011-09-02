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

const Clutter = imports.gi.Clutter;
const EvView = imports.gi.EvinceView;
const Gd = imports.gi.Gd;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const ErrorBox = imports.errorBox;
const Global = imports.global;
const LoadMore = imports.loadMore;
const MainToolbar = imports.mainToolbar;
const Sidebar = imports.sidebar;
const IconView = imports.iconView;
const ListView = imports.listView;
const Preview = imports.preview;
const SpinnerBox = imports.spinnerBox;
const TrackerUtils = imports.trackerUtils;
const Tweener = imports.util.tweener;

const _ = imports.gettext.gettext;

const _WINDOW_DEFAULT_WIDTH = 768;
const _WINDOW_DEFAULT_HEIGHT = 600;

const _PDF_LOADER_TIMEOUT = 300;

const _FULLSCREEN_TOOLBAR_TIMEOUT = 2;

const WindowMode = {
    NONE: 0,
    OVERVIEW: 1,
    PREVIEW: 2
};

function MainWindow() {
    this._init();
}

MainWindow.prototype = {
    _init: function() {
        this._adjChangedId = 0;
        this._docModel = null;
        this._document = null;
        this._fsToolbar = null;
        this._pdfLoader = null;
        this._fullscreen = false;
        this._loaderCancellable = null;
        this._loaderTimeout = 0;
        this._lastFilter = '';
        this._scrolledWindowId = 0;
        this._windowMode = WindowMode.NONE;

        this.window = new GtkClutter.Window({ type: Gtk.WindowType.TOPLEVEL,
                                       window_position: Gtk.WindowPosition.CENTER,
                                       title: _("Documents") });

        this.window.set_size_request(_WINDOW_DEFAULT_WIDTH, _WINDOW_DEFAULT_HEIGHT);
        this.window.maximize();
        this.window.connect('delete-event',
                            Lang.bind(this, this._onDeleteEvent));
        this.window.connect('key-press-event',
                            Lang.bind(this, this._onKeyPressEvent));
        this.window.connect('motion-notify-event',
                            Lang.bind(this, this._fullscreenMotionHandler));

        Global.settings.connect('changed::list-view',
                                Lang.bind(this, this._refreshViewSettings));
        Global.errorHandler.connect('query-error',
                                    Lang.bind(this, this._onQueryError));
        Global.errorHandler.connect('load-error',
                                    Lang.bind(this, this._onLoadError));

        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL });
        this.window.add(this._grid);

        this._sidebar = new Sidebar.Sidebar();
        this._grid.add(this._sidebar.widget);

        this._viewContainer = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });
        this._grid.add(this._viewContainer);

        this._toolbar = new MainToolbar.MainToolbar(this._windowMode);
        this._toolbar.connect('back-clicked',
                              Lang.bind(this, this._onToolbarBackClicked));
        this._viewContainer.add(this._toolbar.widget);

        this._scrolledWin = new Gtk.ScrolledWindow({ hexpand: true,
                                                     vexpand: true,
                                                     shadow_type: Gtk.ShadowType.IN });
        this._scrolledWin.get_style_context().set_junction_sides(Gtk.JunctionSides.BOTTOM);
        this._viewContainer.add(this._scrolledWin);

        this._loadMore = new LoadMore.LoadMoreButton();
        this._viewContainer.add(this._loadMore.widget);

        this._grid.show_all();
        this._setWindowMode(WindowMode.OVERVIEW);
    },

    _onKeyPressEvent: function(widget, event) {
        let keyval = event.get_keyval()[1];
        let state = event.get_state()[1];

        if ((keyval == Gdk.KEY_q) &&
            ((state & Gdk.ModifierType.CONTROL_MASK) != 0)) {
            Global.application.quit();
            return true;
        }

        if (this._windowMode == WindowMode.PREVIEW)
            return this._handleKeyPreview(keyval, state);
        else
            return this._handleKeyOverview(keyval, state);
    },

    _handleKeyPreview: function(keyval, state) {
        if (keyval == Gdk.KEY_f) {
            this._setFullscreen(!this._fullscreen);
            return true;
        }

        if (keyval == Gdk.KEY_Escape && this._fullscreen) {
            this._setFullscreen(false);
            return true;
        }

        if (keyval == Gdk.KEY_Escape) {
            this._setWindowMode(WindowMode.OVERVIEW);
            return true;
        }

        return false;
    },

    _handleKeyOverview: function(keyval, state) {
        if (((keyval == Gdk.KEY_f) &&
            ((state & Gdk.ModifierType.CONTROL_MASK) != 0)) ||
            ((keyval == Gdk.KEY_s) &&
            ((state & Gdk.ModifierType.CONTROL_MASK) != 0))) {
            this._toolbar.getSearchEntry().grab_focus();
            return true;
        }

        return false;
    },

    _onAdjustmentChange: function(adjustment) {
        let end = (adjustment.value == (adjustment.upper - adjustment.get_page_size()));

        // special case this values which happen at construction
        if (adjustment.value == 0 &&
            adjustment.upper == 1 &&
            adjustment.get_page_size() == 1)
            end = false;

        if (end) {
            if (!this._adjChangedId) {
                this._loadMore.setBlock(false);

                //wait for a changed event
                this._adjChangedId = adjustment.connect('changed', Lang.bind(this,
                    function(adjustment) {
                        adjustment.disconnect(this._adjChangedId);
                        this._adjChangedId = 0;

                        this._loadMore.setBlock(true);
                    }));
            }
        } else {
            this._loadMore.setBlock(true);
        }
    },

    _destroyView: function() {
        let child = this._scrolledWin.get_child();
        if (child)
            child.destroy();
    },

    _initView: function() {
        let isList = Global.settings.get_boolean('list-view');

        this._destroyView();

        if (isList)
            this.view = new ListView.ListView(this);
        else
            this.view = new IconView.IconView(this);

        this.view.connect('item-activated', Lang.bind(this, this._onViewItemActivated));
        this._scrolledWin.add(this.view.widget);
    },

    _refreshViewSettings: function() {
        this._initView();
    },

    _setWindowMode: function(windowMode) {
        if (this._windowMode == windowMode)
            return;

        this._windowMode = windowMode;
        this._toolbar.setWindowMode(this._windowMode);

        if (this._windowMode == WindowMode.OVERVIEW)
            this._prepareForOverview();
        else
            this._prepareForPreview();
    },

    _prepareForPreview: function(model, document) {
        this._destroyView();
        this._sidebar.widget.hide();

        this._scrolledWin.vadjustment.disconnect(this._scrolledWindowId);
    },

    _prepareForOverview: function() {
        if (this._loaderCancellable) {
            this._loaderCancellable.cancel();
            this._loaderCancellable = null;
        }

        if (this._pdfLodaer)
            this._pdfLoader = null;

        if (this._preview) {
            this._preview.destroy();
            this._preview = null;
        }

        this._docModel = null;
        this._document = null;

        Global.documentManager.setActiveDocument(null);

        this._setFullscreen(false);

        this._refreshViewSettings();
        this._scrolledWindowId =
            this._scrolledWin.vadjustment.connect('value-changed',
                                                  Lang.bind(this, this._onAdjustmentChange));
        this._onAdjustmentChange(this._scrolledWin.vadjustment);

        this._sidebar.widget.show();
    },

    _createFullscreenToolbar: function() {
        this._fsToolbar = new MainToolbar.FullscreenToolbar();
        this._fsToolbar.setModel(this._docModel, this._document);

        this._fsToolbar.connect('back-clicked',
                                Lang.bind(this, this._onToolbarBackClicked));

        let vScrollbar = this._scrolledWin.get_vscrollbar();

        let sizeConstraint = new Clutter.BindConstraint
            ({ coordinate: Clutter.BindCoordinate.WIDTH,
               source: this.window.get_stage(),
               offset: (vScrollbar.get_visible() ?
                        (- (vScrollbar.get_preferred_width()[1])) : 0 ) });
        // update the constraint size when the scrollbar changes visibility
        vScrollbar.connect('notify::visible',
            function() {
                sizeConstraint.offset = (vScrollbar.get_visible() ?
                                         (- (vScrollbar.get_preferred_width()[1])) : 0 );
            });

        this._fsToolbar.actor.add_constraint(sizeConstraint);

        this.window.get_stage().add_actor(this._fsToolbar.actor);
    },

    _destroyFullscreenToolbar: function() {
        this._fsToolbar.destroy();
        this._fsToolbar = null;
    },

    _setFullscreen: function(fullscreen) {
        if (this._fullscreen == fullscreen)
            return;

        this._fullscreen = fullscreen;
        this._motionTimeoutId = 0;

        Gtk.Settings.get_default().gtk_application_prefer_dark_theme = this._fullscreen;
        this._toolbar.widget.visible = !this._fullscreen;

        if (this._fullscreen) {
            this.window.fullscreen();
            this._createFullscreenToolbar();
        } else {
            this._destroyFullscreenToolbar();
            this.window.unfullscreen();
        }
    },

    _onDeleteEvent: function() {
        Global.application.quit();
    },

    _onViewItemActivated: function(view, urn) {
        if (this._loaderTimeout != 0) {
            Mainloop.source_remove(this._loaderTimeout);
            this._loaderTimeout = 0;
        }

        let doc = Global.documentManager.lookupDocument(urn);
        Global.documentManager.setActiveDocument(doc);

        this._loaderTimeout = Mainloop.timeout_add(_PDF_LOADER_TIMEOUT,
            Lang.bind(this, this._onPdfLoaderTimeout));

        this._loaderCancellable = new Gio.Cancellable();
        doc.loadPreview(this._loaderCancellable, Lang.bind(this, this._onDocumentLoaded));
    },

    _onPdfLoaderTimeout: function() {
        this._loaderTimeout = 0;

        this._setWindowMode(WindowMode.PREVIEW);

        let spinnerBox = new SpinnerBox.SpinnerBox();
        this._scrolledWin.add_with_viewport(spinnerBox.widget);

        return false;
    },

    _onDocumentLoaded: function(document) {
        this._loaderCancellable = null;
        let model = EvView.DocumentModel.new_with_document(document);

        if (this._loaderTimeout) {
            Mainloop.source_remove(this._loaderTimeout);
            this._loaderTimeout = 0;
        }

        this._setWindowMode(WindowMode.PREVIEW);
        this._preview = new Preview.PreviewView(model, document);

        if (this._fsToolbar)
            this._fsToolbar.setModel(model, document);

        this._toolbar.setModel(model, document);

        this._docModel = model;
        this._document = document;

        this._preview.widget.connect('button-press-event',
                                     Lang.bind(this, this._onPreviewButtonPressEvent));
        this._preview.widget.connect('motion-notify-event',
                                     Lang.bind(this, this._fullscreenMotionHandler));

        this._destroyView();
        this._scrolledWin.add(this._preview.widget);
    },

    _onPreviewButtonPressEvent: function(widget, event) {
        let button = event.get_button()[1];
        let clickCount = event.get_click_count()[1];

        if (button == 1 && clickCount == 2) {
            this._setFullscreen(!this._fullscreen);
            return true;
        }

        return false;
    },

    _fullscreenMotionHandler: function(widget, event) {
        if (!this._fullscreen)
            return false;

        // if we were idle fade in the toolbar, otherwise reset
        // the timeout
        if (this._motionTimeoutId == 0) {
                Tweener.addTween(this._fsToolbar.actor,
                                 { opacity: 255,
                                   time: 0.20,
                                   transition: 'easeOutQuad' });
        } else {
            Mainloop.source_remove(this._motionTimeoutId);
        }

        this._motionTimeoutId = Mainloop.timeout_add_seconds
            (_FULLSCREEN_TOOLBAR_TIMEOUT, Lang.bind(this,
                function() {
                    this._motionTimeoutId = 0;

                    if (this._fsToolbar)
                        // fade out the toolbar
                        Tweener.addTween(this._fsToolbar.actor,
                                         { opacity: 0,
                                         time: 0.20,
                                         transition: 'easeOutQuad' });
                    return false;
            }));

        return false;
    },

    _onToolbarBackClicked: function() {
        this._setWindowMode(WindowMode.OVERVIEW);
    },

    _onLoadError: function(manager, message, exception) {
        if (this._loaderTimeout != 0) {
            Mainloop.source_remove(this._loaderTimeout);
            this._loaderTimeout = 0;
        }

        this._loaderCancellable = null;
        // FIXME: we need support for error codes in GJS
        if (exception.toString().indexOf('Operation was cancelled') != -1)
            return;

        this._setWindowMode(WindowMode.PREVIEW);

        let errorBox = new ErrorBox.ErrorBox(message, exception.toString());
        this._scrolledWin.add_with_viewport(errorBox.widget);
    },

    _onQueryError: function(manager, message, exception) {
        this._destroyView();

        let errorBox = new ErrorBox.ErrorBox(message, exception.toString());
        this._scrolledWin.add_with_viewport(errorBox.widget);
    }
};
