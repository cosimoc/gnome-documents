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

    _fullscreenCreateHook: function(action) {
        Global.modeController.connect('can-fullscreen-changed', Lang.bind(this,
            function() {
                let canFullscreen = Global.modeController.getCanFullscreen();
                action.set_enabled(canFullscreen);
            }));
    },

    _viewAsCreateHook: function(action) {
        Global.settings.connect('changed::view-as', Lang.bind(this,
            function() {
                action.state = Global.settings.get_value('view-as');
            }));
    },

    _onActionQuit: function() {
        this._mainWindow.window.destroy();
    },

    _onActionAbout: function() {
        this._mainWindow.showAbout();
    },

    _onActionFullscreen: function() {
        Global.modeController.toggleFullscreen();
    },

    _onActionViewAs: function() {
        Global.settings.set_value('view-as', variant);
    },

    _onActionOpenCurrent: function() {
        let doc = Global.documentManager.getActiveItem();
        if (doc)
            doc.open(this._mainWindow.window.get_screen(), Gtk.get_current_event_time());
    },

    _onActionPrintCurrent: function() {
        let doc = Global.documentManager.getActiveItem();;
        if (doc)
            doc.print(this._mainWindow.window);
    },

    _onActionSearch: function(action) {
        let state = action.get_state();
        action.change_state(GLib.Variant.new('b', !state.get_boolean()));
    },

    _initActions: function() {
        let actionEntries = [
            { name: 'quit',
              callback: this._onActionQuit,
              accel: '<Primary>q' },
            { name: 'about',
              callback: this._onActionAbout },
            { name: 'fullscreen',
              callback: this._onActionFullscreen,
              create_hook: this._fullscreenCreateHook,
              accel: 'F11',
              window_mode: WindowMode.WindowMode.PREVIEW },
            { name: 'view-as',
              callback: this._onActionViewAs,
              create_hook: this._viewAsCreateHook,
              parameter_type: 's',
              state: Global.settings.get_value('view-as'),
              window_mode: WindowMode.WindowMode.OVERVIEW },
            { name: 'open-current',
              callback: this._onActionOpenCurrent,
              window_mode: WindowMode.WindowMode.PREVIEW },
            { name: 'print-current',
              callback: this._onActionPrintCurrent,
              window_mode: WindowMode.WindowMode.PREVIEW },
            { name: 'search',
              callback: this._onActionSearch,
              state: GLib.Variant.new('b', false),
              accel: '<Primary>f' },
            { name: 'find-next', accel: '<Primary>g',
              window_mode: WindowMode.WindowMode.PREVIEW },
            { name: 'find-prev', accel: '<Shift><Primary>g',
              window_mode: WindowMode.WindowMode.PREVIEW },
            { name: 'zoom-in', accel: '<Primary>plus',
              window_mode: WindowMode.WindowMode.PREVIEW },
            { name: 'zoom-out', accel: '<Primary>minus',
              window_mode: WindowMode.WindowMode.PREVIEW }
        ];

        actionEntries.forEach(Lang.bind(this,
            function(actionEntry) {
                let state = actionEntry.state;
                let parameterType = actionEntry.parameter_type ?
                    GLib.VariantType.new(actionEntry.parameter_type) : null;
                let action;

                if (state)
                    action = Gio.SimpleAction.new_stateful(actionEntry.name,
                        parameterType, actionEntry.state);
                else
                    action = new Gio.SimpleAction({ name: actionEntry.name });

                if (actionEntry.create_hook)
                    actionEntry.create_hook.apply(this, [action]);

                if (actionEntry.callback)
                    action.connect('activate', Lang.bind(this, actionEntry.callback));

                if (actionEntry.accel)
                    this.add_accelerator(actionEntry.accel, 'app.' + actionEntry.name, null);

                if (actionEntry.window_mode) {
                    Global.modeController.connect('window-mode-changed', Lang.bind(this,
                        function() {
                            let mode = Global.modeController.getWindowMode();
                            action.set_enabled(mode == actionEntry.window_mode);
                        }));
                }

                this.add_action(action);
            }));
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
