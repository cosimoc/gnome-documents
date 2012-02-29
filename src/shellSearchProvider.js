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
 * Author: Florian Müllner <fmuellner@redhat.com>
 *
 */

const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Gettext = imports.gettext;

const Gd = imports.gi.Gd;
const GdkPixbuf = imports.gi.GdkPixbuf;
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
const Manager = imports.manager;
const Path = imports.path;
const OffsetController = imports.offsetController;
const Query = imports.query;
const Searchbar = imports.searchbar;
const Sources = imports.sources;
const TrackerController = imports.trackerController;
const Utils = imports.utils;

const MAINLOOP_ID = "documents-search-provider";
const AUTOQUIT_TIMEOUT = 120;

const SEARCH_PROVIDER_IFACE = 'org.gnome.Shell.SearchProvider';
const SEARCH_PROVIDER_NAME  = 'org.gnome.Documents.SearchProvider';
const SEARCH_PROVIDER_PATH  = '/org/gnome/Documents/SearchProvider';

const SearchProviderIface = <interface name={SEARCH_PROVIDER_IFACE}>
<method name="GetInitialResultSet">
  <arg type="as" direction="in" />
  <arg type="as" direction="out" />
</method>
<method name = "GetSubsearchResultSet">
  <arg type="as" direction="in" />
  <arg type="as" direction="in" />
  <arg type="as" direction="out" />
</method>
<method name = "GetResultMetas">
  <arg type="as" direction="in" />
  <arg type="aa{sv}" direction="out" />
</method>
<method name = "ActivateResult">
  <arg type="s" direction="in" />
</method>
</interface>;

function ShellSearchProvider() {
    this._init();
}

ShellSearchProvider.prototype = {
    _init: function() {
        Gio.DBus.own_name(Gio.BusType.SESSION,
                          SEARCH_PROVIDER_NAME,
                          Gio.BusNameOwnerFlags.NONE,
                          Lang.bind(this, this._onBusAcquired),
                          Lang.bind(this, this._onNameAcquired),
                          Lang.bind(this, this._onNameLost));

        this._cache = {};
        this._initReal();

        this._timeoutId = 0;
    },

    _onBusAcquired: function() {
        let dbusImpl = Gio.DBusExportedObject.wrapJSObject(SearchProviderIface, this);
        dbusImpl.export(Gio.DBus.session, SEARCH_PROVIDER_PATH);
    },

    _onNameAcquired: function() {
        this._resetTimeout();
    },

    _onNameLost: function() {
        this.quit();
    },

    _initReal: function() {
        String.prototype.format = Format.format;

        Gtk.init(null, null);

        Global.application = this;
        Global.settings = new Gio.Settings({ schema: 'org.gnome.documents' });
        Global.offsetController = new OffsetController.OffsetController();
        Global.searchController = new Searchbar.SearchController();
        Global.errorHandler = new Error.ErrorHandler();

        // connect to tracker
        try {
            Global.connection = Tracker.SparqlConnection.get(null);
        } catch (e) {
            log('Unable to connect to the tracker database: ' + e.toString());
            this.quit();
        }

        try {
            Global.goaClient = Goa.Client.new_sync(null);
        } catch (e) {
            log('Unable to create the GOA client: ' + e.toString());
            this.quit();
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
    },

    _resetTimeout: function() {
        if (this._timeoutId) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }

        if (GLib.getenv('DOCUMENTS_SEARCH_PROVIDER_PERSIST'))
            return;

        this._timeoutId = Mainloop.timeout_add_seconds(AUTOQUIT_TIMEOUT,
                                                       Lang.bind(this,
                                                                 this.quit));
    },

    _createThumbnailIcon: function(uri) {
        let file = Gio.file_new_for_uri(uri);

        try {
            let info = file.query_info(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH,
                                       0, null);
            let path = info.get_attribute_byte_string(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);
            if (path)
                return new Gio.FileIcon({ file: Gio.file_new_for_path(path) });
        } catch(e) {
            log(e);
        }
        return null;
    },

    _createGIcon: function(cursor) {
        let gicon = null;

        let ident = cursor.get_string(Query.QueryColumns.IDENTIFIER)[0];
        let isRemote = ident && (ident.indexOf('https://docs.google.com') != -1);

        if (!isRemote) {
            let uri = cursor.get_string(Query.QueryColumns.URI)[0];
            if (uri)
                gicon = this._createThumbnailIcon(uri);
        }

        if (gicon)
            return gicon;

        let mimetype = cursor.get_string(Query.QueryColumns.MIMETYPE)[0];
        if (mimetype)
            gicon = Gio.content_type_get_icon(mimetype);

        if (gicon)
            return gicon;

        let rdftype = cursor.get_string(Query.QueryColumns.RDFTYPE)[0];
        if (rdftype)
            gicon = Utils.iconFromRdfType(rdftype);

        if (!gicon)
            gicon = new Gio.ThemedIcon({ name: 'text-x-generic' });

        return gicon;
    },

    _createCollectionPixbuf: function(urn) {
        let query = Global.queryBuilder.buildCollectionIconQuery(urn);
        let cursor = Global.connection.query(query.sparql, null);

        let collectionUrns = [];
        while (true) {
            try {
                if (!cursor.next(null)) {
                    cursor.close();
                    break;
                }
            } catch(e) {
                cursor.close();
                break;
            }

            let urn = cursor.get_string(0)[0];
            collectionUrns.push(urn);
        }

        let pixbufs = [];
        collectionUrns.forEach(Lang.bind(this,
            function(urn) {
                let query = Global.queryBuilder.buildSingleQuery(urn);
                let cursor = Global.connection.query(query.sparql, null);

                let valid;
                try {
                    valid = cursor.next(null);
                } catch(e) {
                    log("Failed to query tracker: " + e);
                    valid = false;
                }

                if (!valid) {
                    cursor.close();
                    return;
                }

                let icon = this._createGIcon(cursor);
                cursor.close();

                if (icon instanceof Gio.ThemedIcon) {
                    let theme = Gtk.IconTheme.get_default();
                    let flags = Gtk.IconLookupFlags.FORCE_SIZE |
                                Gtk.IconLookupFlags.GENERIC_FALLBACK;
                    let info = theme.lookup_by_gicon(icon, Utils.getIconSize(),
                                                     flags);

                    try {
                        let pixbuf = info.load_icon();
                        pixbufs.push(pixbuf);
                    } catch(e) {
                        log("Unable to load pixbuf: " + e);
                    }
                } else if (icon instanceof Gio.FileIcon) {
                    try {
                        let stream = icon.load(Utils.getIconSize(), null)[0];
                        let pixbuf = GdkPixbuf.Pixbuf.new_from_stream(stream,
                                                                      null);
                        pixbufs.push(pixbuf);
                    } catch(e) {
                        log("Unable to load pixbuf: " + e);
                    }
                }
            }));
        return Gd.create_collection_icon(Utils.getIconSize(), pixbufs);
    },

    _doSearch: function(terms) {
        Global.searchController.setString(terms.join(' ').toLowerCase());
        let query = Global.queryBuilder.buildGlobalQuery();
        let cursor = Global.connection.query(query.sparql, null);
        let ids = [];
        while(true) {
            try {
                let valid = cursor.next(null);

                if (!valid) {
                    cursor.close();
                    break;
                }
            } catch(e) {
                cursor.close();
                log('Error querying tracker: ' + e);
                break;
            }

            ids.push(cursor.get_string(Query.QueryColumns.URN)[0]);
        }
        return ids;
    },

    _ensureResultMeta: function(id) {
        if (this._cache[id])
            return;

        let query = Global.queryBuilder.buildSingleQuery(id);
        let cursor = Global.connection.query(query.sparql, null);

        try {
            let valid = cursor.next(null);

            if (!valid)
                cursor.close();
        } catch(e) {
            log("Failed to query tracker: " + e);
            cursor.close();
        }

        let title =    cursor.get_string(Query.QueryColumns.TITLE)[0];
        let filename = cursor.get_string(Query.QueryColumns.FILENAME)[0];
        let rdftype =  cursor.get_string(Query.QueryColumns.RDFTYPE)[0];

        let gicon = null;
        let pixbuf = null;

        // Collection
        if (rdftype.indexOf('nfo#DataContainer') != -1)
            pixbuf = this._createCollectionPixbuf(id);
        else
            gicon = this._createGIcon(cursor);

        if (!title || title == '')
            title = Gd.filename_strip_extension(filename);

        if (!title || title == '')
            title = _("Untitled Document");

        this._cache[id] = { id: id, title: title, icon: gicon, pixbuf: pixbuf };
    },

    GetInitialResultSet: function(terms) {
        this._resetTimeout();
        return this._doSearch(terms);
    },

    GetSubsearchResultSet: function(previousResults, terms) {
        this._resetTimeout();
        return this._doSearch(terms);
    },

    GetResultMetas: function(ids) {
        this._resetTimeout();

        let metas = [];
        for (let i = 0; i < ids.length; i++) {
            let id = ids[i];

            this._ensureResultMeta(id);
            let meta = { id: GLib.Variant.new('s', this._cache[id].id),
                         name: GLib.Variant.new('s', this._cache[id].title) };

            let gicon = this._cache[id].icon;
            let pixbuf = this._cache[id].pixbuf;
            if (gicon)
                meta['gicon'] = GLib.Variant.new('s', gicon.to_string());
            else if (pixbuf)
                meta['icon-data'] = Gd.create_variant_from_pixbuf(pixbuf);

            metas.push(meta);
        }
        return metas;
    },

    ActivateResult: function(id) {
        let app = Gio.DesktopAppInfo.new('gnome-documents.desktop');
        if (!app)
            return;

        try {
            if (!app.launch_uris([id], null))
                log('Activating result "' + id + '" failed');
        } catch(e) {
            log('Activating result "' + id + '" failed - ' + e);
        }
    },

    quit: function() {
        Mainloop.quit(MAINLOOP_ID);
    },

    run: function() {
        Mainloop.run(MAINLOOP_ID);
    },
};

function start() {
    let searchProvider = new ShellSearchProvider();
    searchProvider.run();
}
