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
const Signals = imports.signals;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Tracker = imports.gi.Tracker;
const Gd = imports.gi.Gd;
const GdkPixbuf = imports.gi.GdkPixbuf;

const Main = imports.main;
const Utils = imports.utils;

const ModelColumns = {
    URN: 0,
    URI: 1,
    TITLE: 2,
    AUTHOR: 3,
    MTIME: 4,
    ICON: 5,
    RESOURCE_URN: 6,
    N_COLUMNS: 7
};

const OFFSET_STEP = 50;

const TrackerColumns = {
    URN: 0,
    URI: 1,
    TITLE: 2,
    AUTHOR: 3,
    MTIME: 4,
    TOTAL_COUNT: 5,
    IDENTIFIER: 6,
    TYPE: 7,
    RESOURCE_URN: 8
};

const _FILE_ATTRIBUTES = 'standard::icon,standard::content-type,thumbnail::path,time::modified';

function LocalFileInfoLoader(uri) {
    this._init(uri);
}

LocalFileInfoLoader.prototype = {
    _init: function(uri) {
        this._file = Gio.file_new_for_uri(uri);

        this._file.query_info_async(_FILE_ATTRIBUTES,
                                    0, 0, null,
                                    Lang.bind(this, this._onFileQueryInfo));
    },

    _onFileQueryInfo: function(object, res) {
        let info = null;
        let treePath = null;

        try {
            info = object.query_info_finish(res);
        } catch (e) {
            log('Unable to query info for file at ' + this.file.get_uri() + ': ' + e.toString());
        }

        let thumbPath = info.get_attribute_byte_string(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);
        if (thumbPath) {
            this.pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(thumbPath,
                                                                  Utils.getIconSize(),
                                                                  Utils.getIconSize());
        } else {
            let icon = info.get_icon();

            if (icon) {
                let theme = Gtk.IconTheme.get_default();
                let iconInfo = theme.lookup_by_gicon(icon, Utils.getIconSize(),
                                                     Gtk.IconLookupFlags.FORCE_SIZE |
                                                     Gtk.IconLookupFlags.GENERIC_FALLBACK);
                this.pixbuf = iconInfo.load_icon();
            }

            // try to create the thumbnail
            Gd.queue_thumbnail_job_for_file_async(this._file,
                                                  Lang.bind(this, this._onQueueThumbnailJob));
        }

        this.emit('info-loaded');
    },

    _onQueueThumbnailJob: function(object, res) {
        let thumbnailed = Gd.queue_thumbnail_job_for_file_finish(res);

        if (!thumbnailed)
            return;

        // get the new thumbnail path
        this._file.query_info_async(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH,
                                    0, 0, null,
                                    Lang.bind(this, function(object, res) {
                                        let info = null;

                                        try {
                                            info = object.query_info_finish(res);
                                        } catch (e) {
                                            log('Unable to query info for file at ' + uri + ': ' + e.toString());
                                            return;
                                        }

                                        let thumbPath = info.get_attribute_byte_string(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);

                                        if (thumbPath) {
                                            this.pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size
                                                (thumbPath, Utils.getIconSize(), Utils.getIconSize());

                                            this.emit('icon-updated');
                                        }
                                    }));
    }
};
Signals.addSignalMethods(LocalFileInfoLoader.prototype);

function QueryBuilder() {
    this._init();
}

QueryBuilder.prototype = {
    _init: function() {
    },

    _buildFilterSearch: function(subject, searchString) {
        let filter =
            ('fn:contains ' +
             '(fn:lower-case (tracker:coalesce(nie:title(%s), nfo:fileName(%s))), ' +
             '"%s") ' +
             '&& ').format(subject, subject, searchString);

        return filter;
    },

    _buildFilterLocal: function(subject, searchString) {
        let path;
        let desktopURI;
        let documentsURI;

        path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
        if (path)
            desktopURI = Gio.file_new_for_path(path).get_uri();
        else
            desktopURI = '';

        path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS);
        if (path)
            documentsURI = Gio.file_new_for_path(path).get_uri();
        else
            documentsURI = '';

        let filter =
            this._buildFilterSearch(subject, searchString) +
            ('((fn:starts-with (nie:url(%s), "%s")) || ' +
             '(fn:starts-with (nie:url(%s), "%s")))').format(subject, desktopURI,
                                                             subject, documentsURI);

        return filter;
    },

    _buildFilterNotLocal: function(subject, searchString) {
        let filter =
            this._buildFilterSearch(subject, searchString) +
            ('(fn:contains(rdf:type(%s), \"RemoteDataObject\"))').format(subject);

        return filter;
    },

    _buildFilterResource: function(subject, searchString, resourceUrn) {
        let filter =
            this._buildFilterSearch(subject, searchString) +
            ('(nie:dataSource(%s) = "<%s>")').format(subject, resourceUrn);

        return filter;
    },

    _buildFilterString: function(subject, searchString, filterId) {
        let sparql = 'FILTER ((';

        if (filterId == 'local' || filterId == 'all')
            sparql += this._buildFilterLocal(subject, searchString);

        if (filterId == 'all')
            sparql += ') || (';

        if (filterId != 'local' && filterId != 'all')
            sparql += this._buildFilterResource(subject, searchString, filterId);
        else if (filterId == 'all')
            sparql += this._buildFilterNotLocal(subject, searchString);

        sparql += ')) ';

        return sparql;
    },

    _buildTypeFilter: function(subject) {
        let sparql =
            ('{ %s a nfo:PaginatedTextDocument } ' +
             'UNION ' +
             '{ %s a nfo:Spreadsheet } ' +
             'UNION ' +
             '{ %s a nfo:Presentation } ').format(subject, subject, subject);

        return sparql;
    },

    _buildTotalCounter: function(searchString, filterId) {
        let sparql =
            '(SELECT DISTINCT COUNT(?doc) WHERE { ' +
            this._buildTypeFilter('?doc') +
            this._buildFilterString('?doc', searchString, filterId) +
            '}) ';

        return sparql;
    },

    buildQuery: function(offset, searchString, filterId) {
        let sparql =
            ('SELECT DISTINCT ?urn ' + // urn
             'nie:url(?urn) ' + // uri
             'tracker:coalesce(nie:title(?urn), nfo:fileName(?urn)) ' + // title
             'tracker:coalesce(nco:fullname(?creator), nco:fullname(?publisher)) ' + // author
             'tracker:coalesce(nfo:fileLastModified(?urn), nie:contentLastModified(?urn)) AS ?mtime ' + // mtime
             this._buildTotalCounter(searchString, filterId) +
             'nao:identifier(?urn) ' +
             'rdf:type(?urn) ' +
             'nie:dataSource(?urn) ' +
             'WHERE { ' +
             this._buildTypeFilter('?urn') +
             'OPTIONAL { ?urn nco:creator ?creator . } ' +
             'OPTIONAL { ?urn nco:publisher ?publisher . } ' +
             this._buildFilterString('?urn', searchString, filterId) +
             ' } ' +
             'ORDER BY DESC (?mtime)' +
             'LIMIT %d OFFSET %d').format(OFFSET_STEP, offset);

        return sparql;
    }
};

function TrackerModel(callback) {
    this._init(callback);
}

TrackerModel.prototype = {
    _init: function(callback) {
        this._builder = new QueryBuilder();
        this._initCallback = callback;
        Main.settings.connect('changed::list-view', Lang.bind(this, this._onSettingsChanged));

        this.model = Gd.create_list_store();
        this._initConnection();
    },

    _initConnection: function() {
        Tracker.SparqlConnection.get_async(null, Lang.bind(this, function(object, res) {
            try {
                this._connection = Tracker.SparqlConnection.get_finish(res);
            } catch (e) {
                log('Unable to connect to the tracker database: ' + e.toString());
                Main.application.quit();
            }

            if (this._initCallback)
                this._initCallback();
        }));
    },

    _onSettingsChanged: function() {
        this.model.clear();
        this._performCurrentQuery();
    },

    _rowIsGoogle: function(identifier) {
        return (identifier &&
                (identifier.indexOf('https://docs.google.com') != -1));
    },

    _addLocalRowFromCursor: function(cursor) {
        let urn = cursor.get_string(TrackerColumns.URN)[0];
        let uri = cursor.get_string(TrackerColumns.URI)[0];
        let title = cursor.get_string(TrackerColumns.TITLE)[0];
        let author = cursor.get_string(TrackerColumns.AUTHOR)[0];
        let mtime = cursor.get_string(TrackerColumns.MTIME)[0];
        let resourceUrn = cursor.get_string(TrackerColumns.RESOURCE_URN)[0];

        this.itemCount = cursor.get_integer(TrackerColumns.TOTAL_COUNT);

        if (!author)
            author = '';

        let treePath = null;
        let loader = new LocalFileInfoLoader(uri);

        loader.connect('info-loaded', Lang.bind(this,
            function(loader) {
                let iter = this.model.append();
                treePath = this.model.get_path(iter);

                Gd.store_set(this.model, iter,
                             urn, uri, title, author, mtime, loader.pixbuf, resourceUrn);
            }));

        loader.connect('icon-updated', Lang.bind(this,
            function(loader) {
                let objectIter = this.model.get_iter(treePath)[1];
                if (objectIter)
                    Gd.store_update_icon(this.model, objectIter, loader.pixbuf);
            }));
    },

    _pixbufFromRdfType: function(type) {
        let iconName;
        let iconInfo = null;
        let pixbuf = null;

        if (type.indexOf('nfo#Spreadsheet') != -1)
            iconName = 'x-office-spreadsheet';
        else if (type.indexOf('nfo#Presentation') != -1)
            iconName = 'x-office-presentation';
        else
            iconName = 'x-office-document';

        iconInfo =
            Gtk.IconTheme.get_default().lookup_icon(iconName, Utils.getIconSize(),
                                                    Gtk.IconLookupFlags.FORCE_SIZE |
                                                    Gtk.IconLookupFlags.GENERIC_FALLBACK);

        if (iconInfo != null) {
            try {
                pixbuf = iconInfo.load_icon();
            } catch (e) {
                log('Unable to load pixbuf: ' + e.toString());
            }
        }

        return pixbuf;
    },

    _addGoogleRowFromCursor: function(cursor) {
        let urn = cursor.get_string(TrackerColumns.URN)[0];
        let title = cursor.get_string(TrackerColumns.TITLE)[0];
        let author = cursor.get_string(TrackerColumns.AUTHOR)[0];
        let mtime = cursor.get_string(TrackerColumns.MTIME)[0];
        let identifier = cursor.get_string(TrackerColumns.IDENTIFIER)[0];
        let type = cursor.get_string(TrackerColumns.TYPE)[0];
        let resourceUrn = cursor.get_string(TrackerColumns.RESOURCE_URN)[0];

        this.itemCount = cursor.get_integer(TrackerColumns.TOTAL_COUNT);

        if (!author)
            author = '';

        let pixbuf = this._pixbufFromRdfType(type);

        let iter = this.model.append();
        Gd.store_set(this.model, iter,
                     urn, identifier, title, author, mtime, pixbuf, resourceUrn);
    },

    _addRowFromCursor: function(cursor) {
        let identifier = cursor.get_string(TrackerColumns.IDENTIFIER)[0];

        if (this._rowIsGoogle(identifier))
            this._addGoogleRowFromCursor(cursor);
        else
            this._addLocalRowFromCursor(cursor);
    },

    _onCursorNext: function(cursor, res) {
        try {
            let valid = cursor.next_finish(res);

            if (!valid) {
                // signal the total count update and return
                this._emitCountUpdated();
                return;
            }
        } catch (e) {
            // FIXME: error handling
            log('Unable to fetch results from cursor: ' + e.toString());

            return;
        }

        this._addRowFromCursor(cursor);
        cursor.next_async(null, Lang.bind(this, this._onCursorNext));
    },

    _onQueryExecuted: function(object, res) {
        try {
            let cursor = object.query_finish(res);
            cursor.next_async(null, Lang.bind(this, this._onCursorNext));
        } catch (e) {
            // FIXME: error handling
            log('Unable to execute query: ' + e.toString());
        }
    },

    _performCurrentQuery: function() {
        this._connection.query_async(this._builder.buildQuery(this.offset, this._filter, this._resourceUrn),
                                     null, Lang.bind(this, this._onQueryExecuted));
    },

    _emitCountUpdated: function() {
        this.emit('count-updated', this.itemCount, this.offset);
    },

    sourceIdFromResourceUrn: function(resourceUrn, callback) {
        //FIXME: is this right?
        if(resourceUrn[0] != '<')
            resourceUrn = '<' + resourceUrn + '>';

        this._connection.query_async
            (('SELECT ?id WHERE { %s a nie:DataSource; nao:identifier ?id }').format(resourceUrn),
            null, Lang.bind(this,
                function(object, res) {
                    let cursor = null;
                    try {
                        cursor = object.query_finish(res);
                    } catch (e) {
                        log('Unable to resolve resource URN -> account ID: ' + e.toString());
                        return;
                    }

                    cursor.next_async(null, Lang.bind(this,
                        function(object, res) {
                            try {
                                let valid = cursor.next_finish(res);

                                if (!valid) {
                                    callback(null);
                                    return;
                                }
                            } catch (e) {
                                log('Unable to resolve resource URN -> account ID: ' + e.toString());
                            }

                            let sourceId = cursor.get_string(0)[0];
                            callback(sourceId);
                        }));
                }));
    },

    resourceUrnFromSourceId: function(sourceId, callback) {
        this._connection.query_async
            (('SELECT ?urn WHERE { ?urn a nie:DataSource; nao:identifier \"goa:documents:%s\" }').format(sourceId),
            null, Lang.bind(this,
                function(object, res) {
                    let cursor = null;
                    try {
                        cursor = object.query_finish(res);
                    } catch (e) {
                        log('Unable to resolve account ID -> resource URN: ' + e.toString());
                    }

                    cursor.next_async(null, Lang.bind(this,
                        function(object, res) {
                            try {
                                let valid = cursor.next_finish(res);

                                if (!valid) {
                                    callback(null);
                                    return;
                                }
                            } catch (e) {
                                log('Unable to resolve account ID -> resource URN: ' + e.toString());
                            }

                            let urn = cursor.get_string(0)[0];
                            callback(urn);
                        }));
                }));
    },

    populateForOverview: function(resourceUrn, filter) {
        this.offset = 0;
        this._filter = filter;

        this.setAccountFilter(resourceUrn);
    },

    loadMore: function() {
        this.offset += OFFSET_STEP;
        this._performCurrentQuery();
    },

    setFilter: function(filter) {
        this.model.clear();

        this.offset = 0;
        this._filter = filter;

        this._performCurrentQuery();
    },

    setAccountFilter: function(id) {
        if (id == 'all' || id == 'local') {
            this._resourceUrn = id;

            this.model.clear();
            this._performCurrentQuery();

            return;
        }

        this.resourceUrnFromSourceId(id, Lang.bind(this,
            function(resourceUrn) {
                this.model.clear();

                if (resourceUrn) {
                    this._resourceUrn = resourceUrn;
                    this._performCurrentQuery();
                } else {
                    this.offset = 0;
                    this.itemCount = 0;
                    this._emitCountUpdated();
                }
            }));
    }
};
Signals.addSignalMethods(TrackerModel.prototype);
