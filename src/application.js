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

const DBus = imports.dbus;
const Lang = imports.lang;
const Gettext = imports.gettext;

const ClutterX11 = imports.gi.ClutterX11;
const GtkClutter = imports.gi.GtkClutter;
const EvDoc = imports.gi.EvinceDocument;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const Goa = imports.gi.Goa;
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const Tracker = imports.gi.Tracker;

const Categories = imports.categories;
const ChangeMonitor = imports.changeMonitor;
const Collections = imports.collections;
const Documents = imports.documents;
const Error = imports.error;
const Filters = imports.filters;
const Format = imports.format;
const Global = imports.global;
const Main = imports.main;
const MainWindow = imports.mainWindow;
const OffsetController = imports.offsetController;
const Path = imports.path;
const Query = imports.query;
const Selections = imports.selections;
const Sources = imports.sources;
const TrackerController = imports.trackerController;
const Tweener = imports.util.tweener;
const WindowMode = imports.windowMode;

const _GD_DBUS_PATH = '/org/gnome/Documents';

const GdIface = {
    name: 'org.gnome.Documents',

    methods: [ { name: 'activate',
                 inSignature: '',
                 outSignature: '' } ]
};

function RemoteApplication() {
    this._init();
}

RemoteApplication.prototype = {
    _init: function() {
        DBus.session.proxifyObject(this,
                                   GdIface.name,
                                   _GD_DBUS_PATH);
    }
}

DBus.proxifyPrototype(RemoteApplication.prototype, GdIface);

function Application() {
    this._init();
}

Application.prototype = {
    _init: function() {
        DBus.session.acquire_name(GdIface.name,
                                  DBus.SINGLE_INSTANCE,
                                  Lang.bind(this, this._onNameAcquired),
                                  Lang.bind(this, this._onNameNotAcquired));
    },

    _onNameAcquired: function() {
        DBus.session.exportObject(_GD_DBUS_PATH, this);
        this._initReal();
    },

    _onNameNotAcquired: function() {
        let remoteApp = new RemoteApplication();
        remoteApp.activateRemote();

        this.quit();
    },

    _initReal: function() {
        Gettext.bindtextdomain('gnome-documents', Path.LOCALE_DIR);
        Gettext.textdomain('gnome-documents');
        String.prototype.format = Format.format;

        GLib.set_prgname('gnome-documents');
        ClutterX11.disable_event_retrieval();
        GtkClutter.init(null, null);
        EvDoc.init();
        Tweener.init();

        let provider = new Gtk.CssProvider();
        provider.load_from_path(Path.STYLE_DIR + "gtk-style.css");
        Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(),
                                                 provider,
                                                 600);

        Global.application = this;
        Global.settings = new Gio.Settings({ schema: 'org.gnome.documents' });
        Global.offsetController = new OffsetController.OffsetController();
        Global.searchFilterController = new Filters.SearchFilterController();
        Global.categoryManager = new Categories.CategoryManager();
        Global.errorHandler = new Error.ErrorHandler();

        // connect to tracker
        Tracker.SparqlConnection.get_async(null, Lang.bind(this,
            function(object, res) {
                try {
                    Global.connection = Tracker.SparqlConnection.get_finish(res);
                } catch (e) {
                    log('Unable to connect to the tracker database: ' + e.toString());
                    this.quit();
                }

                Goa.Client.new(null, Lang.bind(this,
                    function(object, res) {
                        try {
                            Global.goaClient = Goa.Client.new_finish(res);
                        } catch (e) {
                            log('Unable to create the GOA client: ' + e.toString());
                            this.quit();
                        }

                        Global.sourceManager = new Sources.SourceManager();
                        Global.queryBuilder = new Query.QueryBuilder();
                        Global.changeMonitor = new ChangeMonitor.TrackerChangeMonitor();
                        Global.collectionManager = new Collections.CollectionManager();
                        Global.sideFilterController = new Filters.SideFilterController();
                        Global.documentManager = new Documents.DocumentManager();
                        Global.trackerController = new TrackerController.TrackerController();
                        Global.selectionController = new Selections.SelectionController();
                        Global.modeController = new WindowMode.ModeController();
                        Global.focusController = new WindowMode.FocusController();

                        this._mainWindow = new MainWindow.MainWindow();
                        this.activate();
                    }));
            }));
    },

    activate: function() {
        this._mainWindow.window.present();
    },

    quit: function() {
        Gtk.main_quit();
    }
};
