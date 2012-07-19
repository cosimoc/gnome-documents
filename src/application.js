/*
 * Copyright (c) 2011, 2012 Red Hat, Inc.
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
const Format = imports.format;
const Global = imports.global;
const Main = imports.main;
const MainWindow = imports.mainWindow;
const MainToolbar = imports.mainToolbar;
const Manager = imports.manager;
const Miners = imports.miners;
const Notifications = imports.notifications;
const Path = imports.path;
const Query = imports.query;
const Selections = imports.selections;
const Sources = imports.sources;
const TrackerController = imports.trackerController;
const Tweener = imports.util.tweener;
const Utils = imports.utils;
const WindowMode = imports.windowMode;

const MINER_REFRESH_TIMEOUT = 60; /* seconds */

const Application = new Lang.Class({
    Name: 'Application',
    Extends: Gtk.Application,

    _init: function() {
        Gettext.bindtextdomain('gnome-documents', Path.LOCALE_DIR);
        Gettext.textdomain('gnome-documents');
        GLib.set_prgname('gnome-documents');

        Global.settings = new Gio.Settings({ schema: 'org.gnome.documents' });

        this.parent({ application_id: 'org.gnome.Documents',
                      flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE });
    },

    _initActions: function() {
	let quitAction = new Gio.SimpleAction({ name: 'quit' });
	quitAction.connect('activate', Lang.bind(this,
            function() {
                this._mainWindow.window.destroy();
	    }));
	this.add_action(quitAction);

        let aboutAction = new Gio.SimpleAction({ name: 'about' });
        aboutAction.connect('activate', Lang.bind(this,
            function() {
                this._mainWindow.showAbout();
            }));
        this.add_action(aboutAction);

        let fsAction = new Gio.SimpleAction({ name: 'fullscreen' });
        fsAction.connect('activate', Lang.bind(this,
            function() {
                Global.modeController.toggleFullscreen();
            }));
        Global.modeController.connect('can-fullscreen-changed', Lang.bind(this,
            function() {
                let canFullscreen = Global.modeController.getCanFullscreen();
                fsAction.set_enabled(canFullscreen);
            }));
        this.add_action(fsAction);

        // We can't use GSettings.create_action(), since we want to be able
        // to control the enabled state of the action ourselves
        let viewAsAction = Gio.SimpleAction.new_stateful('view-as',
                                                         GLib.VariantType.new('s'),
                                                         Global.settings.get_value('view-as'));
        viewAsAction.connect('activate', Lang.bind(this,
            function(action, variant) {
                Global.settings.set_value('view-as', variant);
            }));
        Global.settings.connect('changed::view-as', Lang.bind(this,
            function() {
                viewAsAction.state = Global.settings.get_value('view-as');
            }));
        Global.modeController.connect('window-mode-changed', Lang.bind(this,
            function() {
                let mode = Global.modeController.getWindowMode();
                viewAsAction.set_enabled(mode == WindowMode.WindowMode.OVERVIEW);
            }));
        this.add_action(viewAsAction);

        this.add_accelerator('<Primary>q', 'app.quit', null);
        this.add_accelerator('F11', 'app.fullscreen', null);

        // actions for other toolbar menus
        let openAction = new Gio.SimpleAction({ name: 'open-current' });
        openAction.connect('activate', Lang.bind(this,
            function() {
                let doc = Global.documentManager.getActiveItem();
                if (doc)
                    doc.open(this._mainWindow.window.get_screen(), Gtk.get_current_event_time());
            }));
        this.add_action(openAction);

        let printAction = new Gio.SimpleAction({ name: 'print-current' });
        printAction.connect('activate', Lang.bind(this,
            function() {
                let doc = Global.documentManager.getActiveItem();;
                if (doc)
                    doc.print(this._mainWindow.window);
            }));
        this.add_action(printAction);

        // search toolbar button
        let searchAction = Gio.SimpleAction.new_stateful('search',
            null, GLib.Variant.new('b', false));
        searchAction.connect('activate', Lang.bind(this,
            function() {
                let state = searchAction.get_state();
                searchAction.change_state(GLib.Variant.new('b', !state.get_boolean()));
            }));
        this.add_action(searchAction);
        this.add_accelerator('<Primary>f', 'app.search', null);
    },

    _initAppMenu: function() {
        let builder = new Gtk.Builder();
        builder.add_from_resource('/org/gnome/documents/app-menu.ui');

        let menu = builder.get_object('app-menu');
        this.set_app_menu(menu);
    },

    _refreshMinerNow: function(miner) {
        let env = GLib.getenv('DOCUMENTS_DISABLE_MINERS');
        if (env)
            return false;

        miner.RefreshDBRemote(Lang.bind(this,
            function(res, error) {
                if (error) {
                    log('Error updating the cache: ' + error.toString());
                    return;
                }

                Mainloop.timeout_add_seconds(MINER_REFRESH_TIMEOUT,
                                             Lang.bind(this, function() {
                                                 this._refreshMinerNow(miner);
                                             }));
            }));

        return false;
    },

    vfunc_startup: function() {
        this.parent();
        String.prototype.format = Format.format;

        GtkClutter.init(null);
        EvDoc.init();
        Tweener.init();

        let resource = Gio.Resource.load(Path.RESOURCE_DIR + '/gnome-documents.gresource');
        resource._register();

        Global.application = this;

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

        Global.initSearch();

        Global.changeMonitor = new ChangeMonitor.TrackerChangeMonitor();
        Global.documentManager = new Documents.DocumentManager();
        Global.trackerController = new TrackerController.TrackerController();
        Global.selectionController = new Selections.SelectionController();
        Global.modeController = new WindowMode.ModeController();
        Global.notificationManager = new Notifications.NotificationManager();

        // startup a refresh of the gdocs cache
        let gdataMiner = new Miners.GDataMiner();
        this._refreshMinerNow(gdataMiner);

        // startup a refresh of the skydrive cache
        let zpjMiner = new Miners.ZpjMiner();
        this._refreshMinerNow(zpjMiner);

        this._initActions();
        this._initAppMenu();
        this._mainWindow = new MainWindow.MainWindow(this);
    },

    vfunc_activate: function() {
        this._mainWindow.window.present();
    },

    vfunc_command_line: function(commandLine) {
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

                        let doc = Global.documentManager.addDocumentFromCursor(cursor);
                        Global.documentManager.setActiveItem(doc);
                    }));
            }
        } else {
            Global.modeController.setWindowMode(WindowMode.WindowMode.OVERVIEW);
        }

        this.activate();

        return 0;
    }
});
