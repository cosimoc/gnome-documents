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
const WindowMode = imports.windowMode;

const Clutter = imports.gi.Clutter;
const EvView = imports.gi.EvinceView;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;

const _PDF_LOADER_TIMEOUT = 300;
const _FULLSCREEN_TOOLBAR_TIMEOUT = 2;

function ViewEmbed() {
    this._init();
}

ViewEmbed.prototype  = {
    _init: function() {
        this._loaderCancellable = null;
        this._loaderTimeout = 0;
        this._motionTimeoutId = 0;
        this._queryErrorId = 0;
        this._viewSettingsId = 0;

        this.widget = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });

        this._toolbar = new MainToolbar.MainToolbar();
        this.widget.add(this._toolbar.widget);

        Global.errorHandler.connect('load-error',
                                    Lang.bind(this, this._onLoadError));

        Global.modeController.connect('window-mode-changed',
                                      Lang.bind(this, this._onWindowModeChanged));
        Global.modeController.connect('fullscreen-changed',
                                      Lang.bind(this, this._onFullscreenChanged));
        this._onWindowModeChanged();
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
        this._fsToolbar.setModel(this._docModel, this._document);

        this._stage.add_actor(this._fsToolbar.actor);

        let vScrollbar = this._scrolledWin.get_vscrollbar();

        let sizeConstraint = new Clutter.BindConstraint
            ({ coordinate: Clutter.BindCoordinate.WIDTH,
               source: this._stage,
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

    _onWindowModeChanged: function() {
        let mode = Global.modeController.getWindowMode();

        // destroy every child except for the main toolbar
        this.widget.foreach(Lang.bind(this,
            function(widget) {
                if (widget != this._toolbar.widget)
                    widget.destroy();
            }));

        if (mode == WindowMode.WindowMode.OVERVIEW)
            this._prepareForOverview();
        else
            this._prepareForPreview();
    },

    _destroyScrollChild: function() {
        let child = this._scrolledWin.get_child();
        if (child)
            child.destroy();
    },

    _initView: function() {
        let isList = Global.settings.get_boolean('list-view');

        this._destroyScrollChild();

        if (isList)
            this._view = new ListView.ListView(this);
        else
            this._view = new IconView.IconView(this);

        this._view.connect('item-activated', Lang.bind(this, this._onViewItemActivated));
        this._scrolledWin.add(this._view.widget);
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

        Global.modeController.setWindowMode(WindowMode.WindowMode.PREVIEW);

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

        Global.modeController.setWindowMode(WindowMode.WindowMode.PREVIEW);
        Global.modeController.setCanFullscreen(true);

        this._preview = new Preview.PreviewView(model, document);

        if (this._fsToolbar)
            this._fsToolbar.setModel(model, document);

        this._toolbar.setModel(model, document);

        this._docModel = model;
        this._document = document;

        this._preview.widget.connect('motion-notify-event',
                                     Lang.bind(this, this._fullscreenMotionHandler));

        this._destroyScrollChild();
        this._scrolledWin.add(this._preview.widget);
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

        if (this._pdfLodaer)
            this._pdfLoader = null;

        if (this._preview) {
            this._preview.destroy();
            this._preview = null;
        }

        this._actor = null;
        this._clutterEmbed = null;
        this._docModel = null;
        this._document = null;
        this._stage = null;

        Global.documentManager.setActiveDocument(null);

        this._scrolledWin = new Gtk.ScrolledWindow({ hexpand: true,
                                                     vexpand: true,
                                                     shadow_type: Gtk.ShadowType.IN });
        this._scrolledWin.get_style_context().set_junction_sides(Gtk.JunctionSides.BOTTOM);
        this.widget.add(this._scrolledWin);

        this._loadMore = new LoadMore.LoadMoreButton();
        this.widget.add(this._loadMore.widget);

        this._initView();

        this._scrolledWin.vadjustment.connect('value-changed',
                                              Lang.bind(this, this._onAdjustmentChange));
        this._onAdjustmentChange(this._scrolledWin.vadjustment);

        this._viewSettingsId =
            Global.settings.connect('changed::list-view',
                                    Lang.bind(this, this._initView));
        this._queryErrorId =
            Global.errorHandler.connect('query-error',
                                        Lang.bind(this, this._onQueryError));

        this.widget.show_all();
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

    _onQueryError: function(manager, message, exception) {
        this._destroyScrollChild();

        let errorBox = new ErrorBox.ErrorBox(message, exception.message);
        this._scrolledWin.add_with_viewport(errorBox.widget);
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

        this._clutterEmbed = new GtkClutter.Embed();
        this.widget.add(this._clutterEmbed);

        this._scrolledWin = new Gtk.ScrolledWindow({ hexpand: true,
                                                     vexpand: true,
                                                     shadow_type: Gtk.ShadowType.IN });
        this._actor = new GtkClutter.Actor({ contents: this._scrolledWin });

        this._stage = this._clutterEmbed.get_stage();
        this._actor.add_constraint(
            new Clutter.BindConstraint({ coordinate: Clutter.BindCoordinate.WIDTH,
                                         source: this._stage }));
        this._actor.add_constraint(
            new Clutter.BindConstraint({ coordinate: Clutter.BindCoordinate.HEIGHT,
                                         source: this._stage }));

        this._stage.add_actor(this._actor);

        this.widget.show_all();
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

        Global.modeController.setWindowMode(WindowMode.WindowMode.PREVIEW);

        let errorBox = new ErrorBox.ErrorBox(message, exception.message);
        this._scrolledWin.add_with_viewport(errorBox.widget);
    }
};
