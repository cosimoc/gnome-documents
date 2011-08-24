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
const Signals = imports.signals;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Tracker = imports.gi.Tracker;
const Gd = imports.gi.Gd;

const DocFactory = imports.docFactory;
const GDataMiner = imports.gDataMiner;
const Global = imports.global;
const TrackerUtils = imports.trackerUtils;
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

const MINER_REFRESH_TIMEOUT = 60; /* seconds */

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

    buildQuery: function(searchString, filterId) {
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
             'LIMIT %d OFFSET %d').format(Global.offsetController.getOffsetStep(),
                                          Global.offsetController.getOffset());

        return sparql;
    }
};

function TrackerModel(connection) {
    this._init(connection);
}

TrackerModel.prototype = {
    _init: function(connection) {
        this._builder = new QueryBuilder();
        this._factory = new DocFactory.DocFactory();
        Global.settings.connect('changed::list-view', Lang.bind(this, this._onSettingsChanged));

        this.model = Gd.create_list_store();
        this._connection = connection;

        // startup a refresh of the gdocs cache
        this._miner = new GDataMiner.GDataMiner();
        this._refreshMinerNow();

        this._sourceManager = Global.sourceManager;
        this._sourceManager.connect('active-source-changed',
                                    Lang.bind(this, this._refreshAccountFilter));

        this._offsetController = Global.offsetController;
        this._offsetController.connect('offset-changed',
                                       Lang.bind(this, this._performCurrentQuery));
    },

    _onSettingsChanged: function() {
        this._refresh();
    },

    _refreshMinerNow: function() {
        this._miner.RefreshDBRemote(DBus.CALL_FLAG_START, Lang.bind(this,
            function(res, error) {
                if (error) {
                    log('Error updating the GData cache: ' + error.toString());
                    return;
                }

                // FIXME: we must have a way to know from the miner if there were
                // no changes processed, to avoid uselessly refreshing the view.
                // That requires support for the Changes feed in libgdata, see
                // https://bugzilla.gnome.org/show_bug.cgi?id=654652
                this._emitModelUpdatePending();
                this._refresh();

                Mainloop.timeout_add_seconds(MINER_REFRESH_TIMEOUT,
                                             Lang.bind(this, this._refreshMinerNow));
            }));

        return false;
    },

    _addRowFromCursor: function(cursor) {
        this._offsetController.setItemCount(cursor.get_integer(TrackerColumns.TOTAL_COUNT));

        let newDoc = this._factory.newDocument(cursor);
        let iter = this.model.append();
        let treePath = this.model.get_path(iter);

        Gd.store_set(this.model, iter,
                     newDoc.urn, newDoc.uri,
                     newDoc.title, newDoc.author,
                     newDoc.mtime, newDoc.pixbuf,
                     newDoc.resourceUrn);

        newDoc.connect('icon-updated', Lang.bind(this,
            function() {
                let objectIter = this.model.get_iter(treePath)[1];
                if (objectIter)
                    Gd.store_update_icon(this.model, objectIter, newDoc.pixbuf);
            }));
    },

    _onCursorNext: function(cursor, res) {
        try {
            let valid = cursor.next_finish(res);

            if (!valid) {
                // signal the total count update and return
                this._emitModelUpdateDone();
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
        this._connection.query_async(this._builder.buildQuery(this._filter, this._resourceUrn),
                                     null, Lang.bind(this, this._onQueryExecuted));
    },

    _emitModelUpdateDone: function() {
        this.emit('model-update-done');
    },

    _emitModelUpdatePending: function() {
        this.emit('model-update-pending');
    },

    _refresh: function() {
        this.model.clear();
        this._performCurrentQuery();
    },

    populateForOverview: function(filter) {
        this._filter = filter;
        this._refreshAccountFilter(this._sourceManager.getActiveSourceId());
    },

    setFilter: function(filter) {
        this._filter = filter;
        this._offsetController.resetOffset();
        this._refresh();
    },

    _refreshAccountFilter: function() {
        this._resourceUrn = this._sourceManager.getActiveSourceUrn();
        this._refresh();
    }
};
Signals.addSignalMethods(TrackerModel.prototype);
