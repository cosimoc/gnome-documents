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
const Error = imports.error;
const Format = imports.format;
const GDataMiner = imports.gDataMiner;
const Global = imports.global;
const Main = imports.main;
const MainWindow = imports.mainWindow;
const Manager = imports.manager;
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

        let aboutAction = new Gio.SimpleAction({ name: 'about' });
        aboutAction.connect('activate', Lang.bind(this,
            function() {
                this._mainWindow.showAbout();
            }));
        this.application.add_action(aboutAction);

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
        this.application.add_action(fsAction);

        /* FIXME: use GSettings.create_action() once it's introspectable */
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
        this.application.add_action(viewAsAction);

	let menu = new Gio.Menu();

        let viewAs = new Gio.Menu();
        viewAs.append(_("Grid"), 'app.view-as::icon');
        viewAs.append(_("List"), 'app.view-as::list');
        menu.append_section(_("View as"), viewAs);

        let docActions = new Gio.Menu();
        docActions.append(_("Fullscreen"), 'app.fullscreen');
        menu.append_section(null, docActions);

        menu.append(_("About Documents"), 'app.about');
        menu.append(_("Quit"), 'app.quit');

	this.application.set_app_menu(menu);
    },

    _refreshMinerNow: function() {
        this._miner.RefreshDBRemote(DBus.CALL_FLAG_START, Lang.bind(this,
            function(res, error) {
                if (error) {
                    log('Error updating the GData cache: ' + error.toString());
                    return;
                }

                Mainloop.timeout_add_seconds(MINER_REFRESH_TIMEOUT,
                                             Lang.bind(this, this._refreshMinerNow));
            }));

        return false;
    },

    _onStartup: function() {
        String.prototype.format = Format.format;

        GtkClutter.init(null, null);
        EvDoc.init();
        Tweener.init();

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
        Global.errorHandler = new Error.ErrorHandler();
        Global.trackerController = new TrackerController.TrackerController();
        Global.selectionController = new Selections.SelectionController();
        Global.modeController = new WindowMode.ModeController();
        Global.notificationManager = new Notifications.NotificationManager();

        // startup a refresh of the gdocs cache
        this._miner = new GDataMiner.GDataMiner();
        this._refreshMinerNow();

        this._initMenus();
        this._mainWindow = new MainWindow.MainWindow(this.application);
    },

    _commandLine: function(app, commandLine) {
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

        app.activate();

        return 0;
    }
};
