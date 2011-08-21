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

const Main = imports.main;
const MainToolbar = imports.mainToolbar;
const Sidebar = imports.sidebar;
const TrackerModel = imports.trackerModel;
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
        this._pdfLoader = null;
        this._loaderCancellable = null;
        this._loaderTimeout = 0;
        this._lastFilter = '';

        this._currentSourceId = Main.settings.get_string('active-source');

        this.window = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL,
                                       window_position: Gtk.WindowPosition.CENTER,
                                       title: _('Documents') });

        this.window.set_size_request(_WINDOW_DEFAULT_WIDTH, _WINDOW_DEFAULT_HEIGHT);
        this.window.maximize();
        this.window.connect('delete-event',
                            Lang.bind(this, this._onDeleteEvent));

        Main.settings.connect('changed::list-view', Lang.bind(this, function() {
            this._refreshViewSettings(true);
        }));

        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL });
        this.window.add(this._grid);

        this._sidebar = new Sidebar.Sidebar();
        this._sidebar.connect('source-filter-changed', Lang.bind(this, this._onSourceFilterChanged));
        this._grid.add(this._sidebar.widget);

        this._viewContainer = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });
        this._grid.add(this._viewContainer);

        this._toolbar = new MainToolbar.MainToolbar();
        this._toolbar.connect('search-text-changed',
                              Lang.bind(this, this._onToolbarSearchChanged));
        this._toolbar.connect('back-clicked',
                              Lang.bind(this, this._onToolbarBackClicked));
        this._viewContainer.add(this._toolbar.widget);

        this._scrolledWin = new Gtk.ScrolledWindow({ hexpand: true,
                                                     vexpand: true,
                                                     shadow_type: Gtk.ShadowType.IN });
        this._viewContainer.add(this._scrolledWin);

        this._grid.show_all();

        this._model = new TrackerModel.TrackerModel(Lang.bind(this, this._onModelCreated));
        this._model.connect('count-updated', Lang.bind(this, this._onModelCountUpdated));
    },

    _destroyView: function() {
        let child = this._scrolledWin.get_child();
        if (child)
            child.destroy();
    },

    _initView: function() {
        let isList = Main.settings.get_boolean('list-view');

        this._destroyView();

        this._loadMore = new Gtk.Button();
        this._loadMore.connect('clicked', Lang.bind(this, function() {
            this._model.loadMore();
        }));

        this._viewBox = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });
        this._viewBox.add(this._loadMore);

        if (isList)
            this.view = new ListView.ListView(this);
        else
            this.view = new IconView.IconView(this);

        this.view.connect('item-activated', Lang.bind(this, this._onViewItemActivated));

        this._viewBox.attach_next_to(this.view.widget, this._loadMore,
                                     Gtk.PositionType.TOP, 1, 1);

        this._scrolledWin.add_with_viewport(this._viewBox);

        this._viewBox.show();
    },

    _refreshViewSettings: function() {
        this._initView();
        this.view.setModel(this._model.model);
    },

    _refreshLoadMoreButton: function(itemCount, offset) {
        let remainingDocs = itemCount - (offset + TrackerModel.OFFSET_STEP);

        if (remainingDocs <= 0) {
            this._loadMore.hide();
            return;
        }

        if (remainingDocs > TrackerModel.OFFSET_STEP)
            remainingDocs = TrackerModel.OFFSET_STEP;

        this._loadMore.label = _('Load %d more documents').format(remainingDocs);
        this._loadMore.show();
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

        // needs to be called after _refreshViewSettings(), as that
        // recreates the button
        this._refreshLoadMoreButton(this._model.itemCount, this._model.offset);

        this._sidebar.widget.show();
        this._toolbar.setOverview(this._lastFilter);
        this._model.populateForOverview(this._currentSourceId, this._lastFilter);
    },

    _onModelCreated: function() {
        this._prepareForOverview();
    },

    _onDeleteEvent: function() {
        Main.application.quit();
    },

    _onViewItemActivated: function(view, uri, resource) {
        if (this._loaderTimeout != 0) {
            Mainloop.source_remove(this._loaderTimeout);
            this._loaderTimeout = 0;
        }

        TrackerUtils.sourceIdFromResourceUrn(this._model.connection, resource, Lang.bind(this,
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
    },

    _onToolbarSearchChanged: function(toolbar, text) {
        this._lastFilter = text;
        this._model.setFilter(text);
    },

    _onModelCountUpdated: function(model, itemCount, offset) {
        this._refreshLoadMoreButton(itemCount, offset);
    },

    _onSourceFilterChanged: function(sidebar, id) {
        this._currentSourceId = id;
        Main.settings.set_string('active-source', id);

        this._model.setAccountFilter(id);
    }
}
