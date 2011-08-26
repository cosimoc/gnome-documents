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

const EvView = imports.gi.EvinceView;
const Gd = imports.gi.Gd;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Global = imports.global;
const LoadMore = imports.loadMore;
const MainToolbar = imports.mainToolbar;
const Sidebar = imports.sidebar;
const IconView = imports.iconView;
const ListView = imports.listView;
const Preview = imports.preview;
const SpinnerBox = imports.spinnerBox;
const TrackerUtils = imports.trackerUtils;

const _ = imports.gettext.gettext;

const _WINDOW_DEFAULT_WIDTH = 768;
const _WINDOW_DEFAULT_HEIGHT = 600;

const _PDF_LOADER_TIMEOUT = 300;

function MainWindow() {
    this._init();
}

MainWindow.prototype = {
    _init: function() {
        this._adjChangedId = 0;
        this._pdfLoader = null;
        this._loaderCancellable = null;
        this._loaderTimeout = 0;
        this._lastFilter = '';

        this.window = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL,
                                       window_position: Gtk.WindowPosition.CENTER,
                                       title: _("Documents") });

        this.window.set_size_request(_WINDOW_DEFAULT_WIDTH, _WINDOW_DEFAULT_HEIGHT);
        this.window.maximize();
        this.window.connect('delete-event',
                            Lang.bind(this, this._onDeleteEvent));

        Global.settings.connect('changed::list-view',
                                Lang.bind(this, this._refreshViewSettings));

        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL });
        this.window.add(this._grid);

        this._sidebar = new Sidebar.Sidebar();
        this._grid.add(this._sidebar.widget);

        this._viewContainer = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });
        this._grid.add(this._viewContainer);

        this._toolbar = new MainToolbar.MainToolbar();
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

        this._scrolledWin.vadjustment.connect('value-changed', Lang.bind(this, this._onAdjustmentChange));
        this._onAdjustmentChange(this._scrolledWin.vadjustment);

        this._grid.show_all();
        this._prepareForOverview();
    },

    _onAdjustmentChange: function(adjustment) {
        let end = (adjustment.value == (adjustment.upper - adjustment.get_page_size()));

        if (adjustment.value == 0 &&
            adjustment.upper == 0 &&
            adjustment.get_page_size() == 0)
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

    _prepareForPreview: function(model, document) {
        this._destroyView();
        this._sidebar.widget.hide();

        this._toolbar.setPreview(model, document);
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

        this._refreshViewSettings();

        this._sidebar.widget.show();
        this._toolbar.setOverview();
    },

    _onDeleteEvent: function() {
        Global.application.quit();
    },

    _onViewItemActivated: function(view, uri, resource) {
        if (this._loaderTimeout != 0) {
            Mainloop.source_remove(this._loaderTimeout);
            this._loaderTimeout = 0;
        }

        TrackerUtils.sourceIdFromResourceUrn(resource, Lang.bind(this,
            function(sourceId) {
                this._loaderCancellable = new Gio.Cancellable();
                this._pdfLoader = new Gd.PdfLoader({ source_id: sourceId });
                this._pdfLoader.load_uri_async(uri, this._loaderCancellable, Lang.bind(this, this._onDocumentLoaded));

                this._loaderTimeout = Mainloop.timeout_add(_PDF_LOADER_TIMEOUT,
                                                           Lang.bind(this, this._onPdfLoaderTimeout));
            }));
    },

    _onPdfLoaderTimeout: function() {
        this._loaderTimeout = 0;

        this._prepareForPreview();

        let spinnerBox = new SpinnerBox.SpinnerBox();
        this._scrolledWin.add_with_viewport(spinnerBox.widget);

        return false;
    },

    _onDocumentLoaded: function(loader, res) {
        let document = null;
        try {
            document = loader.load_uri_finish(res);
        } catch (e) {
            log("Unable to load the PDF document: " + e.toString());
            return;
        }

        this._loaderCancellable = null;
        let model = EvView.DocumentModel.new_with_document(document);

        if (this._loaderTimeout) {
            Mainloop.source_remove(this._loaderTimeout);
            this._loaderTimeout = 0;
        }

        this._prepareForPreview(model, document);
        this._preview = new Preview.PreviewView(model, document);

        this._scrolledWin.add(this._preview.widget);
    },

    _onToolbarBackClicked: function() {
        this._prepareForOverview();
    }
};
