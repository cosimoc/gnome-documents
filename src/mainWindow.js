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

const Gd = imports.gi.Gd;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Main = imports.main;
const MainToolbar = imports.mainToolbar;
const TagBar = imports.tagBar;
const TrackerModel = imports.trackerModel;
const IconView = imports.iconView;
const ListView = imports.listView;

const _ = imports.gettext.gettext;

const _WINDOW_DEFAULT_WIDTH = 860;
const _WINDOW_DEFAULT_HEIGHT = 600;

const _SEARCH_ENTRY_TIMEOUT = 200;

function MainWindow() {
    this._init();
}

MainWindow.prototype = {
    _init: function() {
        this.window = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL,
                                       window_position: Gtk.WindowPosition.CENTER,
                                       resizable: false,
                                       title: _('Documents') });

        this.window.set_size_request(_WINDOW_DEFAULT_WIDTH, _WINDOW_DEFAULT_HEIGHT);
        this.window.connect('delete-event',
                            Lang.bind(this, this._onDeleteEvent));

        Main.settings.connect('changed::list-view', Lang.bind(this, function() {
            this._refreshViewSettings(true)
        }));

        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                    vexpand: true });
        this.window.add(this._grid);

        this._searchTimeout = 0;
        this.toolbar = new MainToolbar.MainToolbar();
        this.toolbar.setOverview();
        this.toolbar.searchEntry.connect('changed', 
                                         Lang.bind(this, this._onSearchEntryChanged));

        this._grid.add(this.toolbar.widget);

        this._scrolledWin = new Gtk.ScrolledWindow();
        this._grid.add(this._scrolledWin);;

        this._loadMore = new Gtk.Button();
        this._loadMore.connect('clicked', Lang.bind(this, function() {
            this._model.loadMore();
        }));

        this._viewBox = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });
        this._viewBox.add(this._loadMore);

        this._initView(this);

        this._scrolledWin.add_with_viewport(this._viewBox);

        this._grid.show_all();

        this._model = new TrackerModel.TrackerModel(Lang.bind(this, this._onModelCreated));
        this._model.connect('count-updated', Lang.bind(this, this._onModelCountUpdated));
    },

    _destroyView: function() {
        if (this.view) {
            this.view.destroy();
        }
    },

    _initView: function() {
        let isList = Main.settings.get_boolean('list-view');

        this._destroyView();

        if (isList)
            this.view = new ListView.ListView(this);
        else
            this.view = new IconView.IconView(this);

        this._viewBox.attach_next_to(this.view.widget, this._loadMore,
                                     Gtk.PositionType.TOP, 1, 1);
    },

    _refreshViewSettings: function() {
        this._initView();
        this.view.setModel(this._model.model);
    },

    _onModelCreated: function() {
        this.view.setModel(this._model.model);
        this._model.populateForOverview();
    },

    _onDeleteEvent: function() {
        Main.application.quit();
    },

    _onSearchEntryChanged: function() {
        if (this._searchTimeout != 0) {
            GLib.source_remove(this._searchTimeout)
            this._searchTimeout = 0;
        }

        this._searchTimeout = Mainloop.timeout_add(_SEARCH_ENTRY_TIMEOUT,
                                                   Lang.bind(this, this._onSearchEntryTimeout));
    },

    _onSearchEntryTimeout: function() {
        this._searchTimeout = 0;

        let text = this.toolbar.searchEntry.get_text();
        this._model.setFilter(text);
    },

    _onModelCountUpdated: function(model, itemCount, offset) {
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
}
