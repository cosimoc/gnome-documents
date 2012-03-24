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

const Documents = imports.documents;
const Format = imports.format;
const Global = imports.global;
const Path = imports.path;
const Query = imports.query;
const Utils = imports.utils;

const MAINLOOP_ID = "documents-search-provider";
const AUTOQUIT_TIMEOUT = 120;

const SEARCH_PROVIDER_IFACE = 'org.gnome.Shell.SearchProvider';
const SEARCH_PROVIDER_NAME  = 'org.gnome.Documents.SearchProvider';
const SEARCH_PROVIDER_PATH  = '/org/gnome/Documents/SearchProvider';

const _SHELL_SEARCH_ICON_SIZE = 128;

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

function _createThumbnailIcon(uri) {
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
}

function _createGIcon(cursor) {
    let gicon = null;

    let ident = cursor.get_string(Query.QueryColumns.IDENTIFIER)[0];
    let isRemote = ident && (ident.indexOf('https://docs.google.com') != -1);

    if (!isRemote) {
        let uri = cursor.get_string(Query.QueryColumns.URI)[0];
        if (uri)
            gicon = _createThumbnailIcon(uri);
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
}

function CreateCollectionIconJob(id) {
    this._init(id);
}

CreateCollectionIconJob.prototype = {
    _init: function(id) {
        this._id = id;
        this._itemIcons = [];
        this._itemIds = [];
        this._itemJobs = 0;
    },

    run: function(callback) {
        this._callback = callback;

        let query = Global.queryBuilder.buildCollectionIconQuery(this._id);
        Global.connectionQueue.add(query.sparql, null, Lang.bind(this,
            function(object, res) {
                let cursor = null;

                try {
                    cursor = object.query_finish(res);
                    cursor.next_async(null, Lang.bind(this, this._onCursorNext));
                } catch (e) {
                    log('Error querying tracker: ' + e);
                    this._hasItemIds();
                }
            }));
    },

    _createItemIcon: function(cursor) {
        let pixbuf = null;
        let icon = _createGIcon(cursor);

        if (icon instanceof Gio.ThemedIcon) {
            let theme = Gtk.IconTheme.get_default();
            let flags =
                Gtk.IconLookupFlags.FORCE_SIZE |
                Gtk.IconLookupFlags.GENERIC_FALLBACK;
            let info =
                theme.lookup_by_gicon(icon, _SHELL_SEARCH_ICON_SIZE,
                                      flags);

            try {
                pixbuf = info.load_icon();
            } catch(e) {
                log("Unable to load pixbuf: " + e);
            }
        } else if (icon instanceof Gio.FileIcon) {
            try {
                let stream = icon.load(_SHELL_SEARCH_ICON_SIZE, null)[0];
                pixbuf = GdkPixbuf.Pixbuf.new_from_stream(stream,
                                                          null);
            } catch(e) {
                log("Unable to load pixbuf: " + e);
            }
        }

        return pixbuf;
    },

    _onCursorNext: function(cursor, res) {
        let valid = false;

        try {
            valid = cursor.next_finish(res);
        } catch (e) {
            cursor.close();
            log('Error querying tracker: ' + e);

            this._hasItemIds();
        }

        if (valid) {
            this._itemIds.push(cursor.get_string(0)[0]);
            cursor.next_async(null, Lang.bind(this, this._onCursorNext));
        } else {
            cursor.close();
            this._hasItemIds();
        }
    },

    _hasItemIds: function() {
        if (this._itemIds.length == 0) {
            this._returnPixbuf();
            return;
        }

        this._itemIds.forEach(Lang.bind(this,
            function(itemId) {
                let job = new Documents.SingleItemJob(itemId);
                this._itemJobs++;
                job.run(Query.QueryFlags.UNFILTERED, Lang.bind(this,
                    function(cursor) {
                        let icon = this._createItemIcon(cursor);
                        if (icon)
                            this._itemIcons.push(icon);
                        this._itemJobCollector();
                    }));
            }));
    },

    _itemJobCollector: function() {
        this._itemJobs--;

        if (this._itemJobs == 0)
            this._returnPixbuf();
    },

    _returnPixbuf: function() {
        this._callback(Gd.create_collection_icon(_SHELL_SEARCH_ICON_SIZE, this._itemIcons));
    }
};

function FetchMetasJob(ids) {
    this._init(ids);
}

FetchMetasJob.prototype = {
    _init: function(ids) {
        this._ids = ids;
        this._metas = [];
    },

    _jobCollector: function() {
        this._activeJobs--;

        if (this._activeJobs == 0)
            this._callback(this._metas);
    },

    _createCollectionPixbuf: function(meta) {
        let job = new CreateCollectionIconJob(meta.id);
        job.run(Lang.bind(this,
            function(icon) {
                if (icon)
                    meta.pixbuf = icon;

                this._metas.push(meta);
                this._jobCollector();
            }));
    },

    run: function(callback) {
        this._callback = callback;
        this._activeJobs = this._ids.length;

        this._ids.forEach(Lang.bind(this,
            function(id) {
                let single = new Documents.SingleItemJob(id);
                single.run(Query.QueryFlags.UNFILTERED, Lang.bind(this,
                    function(cursor) {
                        let title =    cursor.get_string(Query.QueryColumns.TITLE)[0];
                        let filename = cursor.get_string(Query.QueryColumns.FILENAME)[0];
                        let rdftype =  cursor.get_string(Query.QueryColumns.RDFTYPE)[0];

                        let gicon = null;
                        let pixbuf = null;

                        // Collection
                        let isCollection = (rdftype.indexOf('nfo#DataContainer') != -1);

                        if (!isCollection)
                            gicon = _createGIcon(cursor);

                        if (!title || title == '')
                            title = Gd.filename_strip_extension(filename);

                        if (!title || title == '')
                            title = _("Untitled Document");

                        let meta = { id: id, title: title, icon: gicon };

                        if (isCollection) {
                            this._createCollectionPixbuf(meta);
                        } else {
                            this._metas.push(meta);
                            this._jobCollector();
                        }
                    }));
            }));
    }
};

function FetchIdsJob(terms) {
    this._init(terms);
}

FetchIdsJob.prototype = {
    _init: function(terms) {
        this._terms = terms;
        this._ids = [];
    },

    run: function(callback, cancellable) {
        this._callback = callback;
        this._cancellable = cancellable;
        Global.searchController.setString(this._terms.join(' ').toLowerCase());

        let query = Global.queryBuilder.buildGlobalQuery();
        Global.connectionQueue.add(query.sparql, this._cancellable, Lang.bind(this,
            function(object, res) {
                let cursor = null;

                try {
                    cursor = object.query_finish(res);
                    cursor.next_async(this._cancellable, Lang.bind(this, this._onCursorNext));
                } catch (e) {
                    log('Error querying tracker: ' + e);
                    callback(this._ids);
                }
            }));
    },

    _onCursorNext: function(cursor, res) {
        let valid = false;

        try {
            valid = cursor.next_finish(res);
        } catch (e) {
            cursor.close();
            log('Error querying tracker: ' + e);

            this._callback(this._ids);
        }

        if (valid) {
            this._ids.push(cursor.get_string(Query.QueryColumns.URN)[0]);
            cursor.next_async(this._cancellable, Lang.bind(this, this._onCursorNext));
        } else {
            cursor.close();
            this._callback(this._ids);
        }
    }
};

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
        this._cancellable = new Gio.Cancellable();
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

        Global.initSearch();
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

    _returnMetasFromCache: function(ids, invocation) {
        let metas = [];
        for (let i = 0; i < ids.length; i++) {
            let id = ids[i];

            if (!this._cache[id])
                continue;

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
        invocation.return_value(GLib.Variant.new('(aa{sv})', [ metas ]));
    },

    GetInitialResultSetAsync: function(params, invocation) {
        let terms = params[0];
        this._resetTimeout();

        this._cancellable.cancel();
        this._cancellable.reset();

        let job = new FetchIdsJob(terms);
        job.run(Lang.bind(this,
            function(ids) {
                invocation.return_value(GLib.Variant.new('(as)', [ ids ]));
            }), this._cancellable);
    },

    GetSubsearchResultSetAsync: function(params, invocation) {
        let [previousResults, terms] = params;
        this._resetTimeout();

        this._cancellable.cancel();
        this._cancellable.reset();

        let job = new FetchIdsJob(terms);
        job.run(Lang.bind(this,
            function(ids) {
                invocation.return_value(GLib.Variant.new('(as)', [ ids ]));
            }), this._cancellable);
    },

    GetResultMetasAsync: function(params, invocation) {
        let ids = params[0];
        this._resetTimeout();

        let toFetch = ids.filter(Lang.bind(this,
            function(id) {
                return !(this._cache[id]);
            }));

        if (toFetch.length > 0) {
            let job = new FetchMetasJob(toFetch);
            job.run(Lang.bind(this,
                function(metas) {
                    // cache the newly fetched results
                    metas.forEach(Lang.bind(this,
                        function(meta) {
                            this._cache[meta.id] = meta;
                        }));

                    this._returnMetasFromCache(ids, invocation);
                }));
        } else {
            this._returnMetasFromCache(ids, invocation);
        }
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
    }
};

function start() {
    let searchProvider = new ShellSearchProvider();
    searchProvider.run();
}
