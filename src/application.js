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
const Gettext = imports.gettext;
const _ = imports.gettext.gettext;

const GtkClutter = imports.gi.GtkClutter;
const EvDoc = imports.gi.EvinceDocument;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const Goa = imports.gi.Goa;
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const Tracker = imports.gi.Tracker;

const ChangeMonitor = imports.changeMonitor;
const Documents = imports.documents;
const Error = imports.error;
const Format = imports.format;
const Global = imports.global;
const Main = imports.main;
const MainWindow = imports.mainWindow;
const Manager = imports.manager;
const OffsetController = imports.offsetController;
const Path = imports.path;
const Query = imports.query;
const Searchbar = imports.searchbar;
const Selections = imports.selections;
const Sources = imports.sources;
const TrackerController = imports.trackerController;
const Tweener = imports.util.tweener;
const Utils = imports.utils;
const WindowMode = imports.windowMode;

function Application() {
    this._init();
}

Application.prototype = {
    _init: function() {
        Gettext.bindtextdomain('gnome-documents', Path.LOCALE_DIR);
        Gettext.textdomain('gnome-documents');
        GLib.set_prgname('gnome-documents');

        Global.settings = new Gio.Settings({ schema: 'org.gnome.documents' });

        // TODO: subclass Gtk.Application once we support GObject inheritance,
        //       see https://bugzilla.gnome.org/show_bug.cgi?id=663492
        this.application = new Gtk.Application({
            application_id: 'org.gnome.Documents',
            flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE
        });
        GLib.set_prgname('gnome-documents');
        this.application.connect('startup', Lang.bind(this, this._onStartup));
        this.application.connect('command-line', Lang.bind(this, this._commandLine));
        this.application.connect('activate', Lang.bind(this,
            function() {
                this._mainWindow.window.present();
            }));
    },

    _initMenus: function() {
	let quitAction = new Gio.SimpleAction({ name: 'quit' });
	quitAction.connect('activate', Lang.bind(this,
            function() {
                this._mainWindow.window.destroy();
	    }));
	this.application.add_action(quitAction);

        let fsAction = new Gio.SimpleAction({ name: 'fullscreen' });
        fsAction.connect('activate', Lang.bind(this,
            function() {
                Global.modeController.toggleFullscreen();
            }));
        Global.modeController.connect('window-mode-changed', Lang.bind(this,
            function() {
                let mode = Global.modeController.getWindowMode();
                fsAction.set_enabled(mode == WindowMode.WindowMode.PREVIEW);
            }));
        this.application.add_action(fsAction);

        let viewAsAction = Gio.SimpleAction.new_stateful('view-as',
                                                         GLib.VariantType.new('s'),
                                                         Utils.listSettingToMenu());
        viewAsAction.connect('activate', Lang.bind(this,
            function(action, variant) {
                Global.settings.set_boolean('list-view', Utils.listMenuToSetting(variant));
            }));
        Global.settings.connect('changed::list-view', Lang.bind(this,
            function() {
                viewAsAction.state = Utils.listSettingToMenu();
            }));
        this.application.add_action(viewAsAction);

	let menu = new Gio.Menu();
        menu.append(_("Fullscreen"), 'app.fullscreen');
	menu.append(_("Quit"), 'app.quit');

        let viewAs = new Gio.Menu();
        viewAs.append(_("Grid"), 'app.view-as::grid');
        viewAs.append(_("List"), 'app.view-as::list');
        menu.prepend_section(_("View as"), viewAs);

	this.application.set_app_menu(menu);
    },

    _onStartup: function() {
        String.prototype.format = Format.format;

        GtkClutter.init(null, null);
        EvDoc.init();
        Tweener.init();

        Global.application = this;
        Global.offsetController = new OffsetController.OffsetController();
        Global.searchController = new Searchbar.SearchController();
        Global.errorHandler = new Error.ErrorHandler();

        // connect to tracker
        try {
            Global.connection = Tracker.SparqlConnection.get(null);
        } catch (e) {
            log('Unable to connect to the tracker database: ' + e.toString());
            return;
        }

        try {
            Global.goaClient = Goa.Client.new_sync(null);
        } catch (e) {
            log('Unable to create the GOA client: ' + e.toString());
            return;
        }

        Global.connectionQueue = new TrackerController.TrackerConnectionQueue();
        Global.sourceManager = new Sources.SourceManager();
        Global.searchCategoryManager = new Searchbar.SearchCategoryManager();
        Global.searchMatchManager = new Searchbar.SearchMatchManager();
        Global.searchTypeManager = new Searchbar.SearchTypeManager();
        Global.queryBuilder = new Query.QueryBuilder();
        Global.changeMonitor = new ChangeMonitor.TrackerChangeMonitor();
        Global.collectionManager = new Manager.BaseManager();
        Global.documentManager = new Documents.DocumentManager();
        Global.trackerController = new TrackerController.TrackerController();
        Global.selectionController = new Selections.SelectionController();
        Global.modeController = new WindowMode.ModeController();

        this._initMenus();
        this._mainWindow = new MainWindow.MainWindow(this.application);
    },

    _commandLine: function(app, commandLine) {
        app.activate();

        let args = commandLine.get_arguments();
        if (args.length) {
            let urn = args[0]; // gjs eats argv[0]
            let doc = Global.documentManager.getItemById(args[0]);
            if (doc) {
                Global.documentManager.setActiveItem(doc);
            } else {
                let job = new Documents.SingleItemJob(urn);
                job.run(Query.QueryFlags.UNFILTERED, Lang.bind(this,
                    function(cursor) {
                        if (!cursor)
                            return;
                        let doc = Global.documentManager.createDocumentFromCursor(cursor);
                        Global.documentManager.addItem(doc);
                        Global.documentManager.setActiveItem(doc);
                    }));
            }
        }
        return 0;
    }
};
