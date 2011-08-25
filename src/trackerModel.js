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
    RESOURCE_URN: 8,
    FAVORITE: 9
};

function QueryBuilder() {
    this._init();
}

QueryBuilder.prototype = {
    _init: function() {
    },

    _buildFilterSearch: function(subject) {
        let filter =
            ('fn:contains ' +
             '(fn:lower-case (tracker:coalesce(nie:title(%s), nfo:fileName(%s))), ' +
             '"%s")').format(subject, subject, Global.filterController.getFilter());

        return filter;
    },

    _buildFilterString: function(subject) {
        let sparql = 'FILTER ((';

        sparql += this._buildFilterSearch(subject);
        sparql += ') && (';
        sparql += Global.sourceManager.getActiveSourceFilter(subject);

        sparql += '))';

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

    _buildTotalCounter: function() {
        let sparql =
            '(SELECT DISTINCT COUNT(?doc) WHERE { ' +
            this._buildTypeFilter('?doc') +
            this._buildFilterString('?doc') +
            '}) ';

        return sparql;
    },

    buildQuery: function() {
        let sparql =
            ('SELECT DISTINCT ?urn ' + // urn
             'nie:url(?urn) ' + // uri
             'tracker:coalesce(nie:title(?urn), nfo:fileName(?urn)) ' + // title
             'tracker:coalesce(nco:fullname(?creator), nco:fullname(?publisher)) ' + // author
             'tracker:coalesce(nfo:fileLastModified(?urn), nie:contentLastModified(?urn)) AS ?mtime ' + // mtime
             this._buildTotalCounter() + // totalCount
             'nao:identifier(?urn) ' + // identifier
             'rdf:type(?urn) ' + // type
             'nie:dataSource(?urn) ' + // resource URN
             '( EXISTS { ?urn nao:hasTag nao:predefined-tag-favorite } )' + // favorite
             'WHERE { ' +
             this._buildTypeFilter('?urn') +
             'OPTIONAL { ?urn nco:creator ?creator . } ' +
             'OPTIONAL { ?urn nco:publisher ?publisher . } ' +
             Global.categoryManager.getActiveCategoryFilter() +
             this._buildFilterString('?urn') +
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
        this._docs = [];

        this._builder = new QueryBuilder();
        this._factory = new DocFactory.DocFactory();

        this.model = Gd.create_list_store();
        this._connection = connection;

        // startup a refresh of the gdocs cache
        this._miner = new GDataMiner.GDataMiner();
        this._refreshMinerNow();

        this._sourceManager = Global.sourceManager;
        this._sourceManager.connect('active-source-changed',
                                    Lang.bind(this, this._refresh));

        this._categoryManager = Global.categoryManager;
        this._categoryManager.connect('active-category-changed',
                                      Lang.bind(this, this._refresh));

        this._offsetController = Global.offsetController;
        this._offsetController.connect('offset-changed',
                                       Lang.bind(this, this._performCurrentQuery));

        this._filterController = Global.filterController;
        this._filterController.connect('filter-changed',
                                       Lang.bind(this, this._onFilterChanged));

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

        this._docs.push(newDoc);
    },

    _onQueryFinished: function() {
        Global.selectionController.freezeSelection(false);
    },

    _onCursorNext: function(cursor, res) {
        try {
            let valid = cursor.next_finish(res);

            if (!valid) {
                // signal the total count update and return
                this._onQueryFinished();
                return;
            }
        } catch (e) {
            // FIXME: error handling
            log('Unable to fetch results from cursor: ' + e.toString());
            this._onQueryFinished();

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
            this._onQueryFinished();
        }
    },

    _performCurrentQuery: function() {
        this._connection.query_async(this._builder.buildQuery(),
                                     null, Lang.bind(this, this._onQueryExecuted));
    },

    _emitModelUpdateDone: function() {
        this.emit('model-update-done');
    },

    _refresh: function() {
        Global.selectionController.freezeSelection(true);
        this.model.clear();

        this._docs.forEach(function(doc) {
            doc.destroy();
        });
        this._docs = [];

        this._performCurrentQuery();
    },

    _onFilterChanged: function() {
        this._offsetController.resetOffset();
        this._refresh();
    }
};
Signals.addSignalMethods(TrackerModel.prototype);
