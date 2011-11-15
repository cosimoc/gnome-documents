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

const Global = imports.global;

const Gd = imports.gi.Gd;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

const QueryColumns = {
    URN: 0,
    URI: 1,
    FILENAME: 2,
    MIMETYPE: 3,
    TITLE: 4,
    AUTHOR: 5,
    MTIME: 6,
    IDENTIFIER: 7,
    RDFTYPE: 8,
    RESOURCE_URN: 9,
    FAVORITE: 10,
    SHARED: 11
};

const QueryFlags = {
    NONE: 0,
    UNFILTERED: 1 << 0
};

const LOCAL_COLLECTIONS_IDENTIFIER = 'gd:collection:local:';

function Query(sparql) {
    this._init(sparql);
}

Query.prototype = {
    _init: function(sparql) {
        this.sparql = sparql;
        this.activeSource = Global.sourceManager.getActiveItem();
    }
};

function QueryBuilder() {
    this._init();
}

QueryBuilder.prototype = {
    _init: function() {
    },

    buildFilterLocal: function() {
        let path;
        let desktopURI;
        let downloadsURI;
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

        path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD);
        if (path)
            downloadsURI = Gio.file_new_for_path(path).get_uri();
        else
            downloadsURI = '';

        let filter =
            ('((fn:starts-with (nie:url(?urn), "%s")) || ' +
             ' (fn:starts-with (nie:url(?urn), "%s")) || ' +
             ' (fn:starts-with (nie:url(?urn), "%s")) || ' +
             ' (fn:starts-with (nao:identifier(?urn), "gd:collection:local:")))').format(desktopURI, documentsURI, downloadsURI);

        return filter;
    },

    buildFilterNotLocal: function() {
        let sparql = '(';
        let sources = Global.sourceManager.getItems();

        for (idx in sources) {
            let source = sources[idx];
            if (!source.builtin)
                sparql += source.getFilter() + ' || ';
        }

        sparql += 'false)';

        return sparql;
    },

    _buildFilterString: function() {
        let sparql = 'FILTER (';

        sparql += Global.searchMatchManager.getFilter();
        sparql += ' && ';
        sparql += Global.sourceManager.getFilter();
        sparql += ' && ';
        sparql += Global.searchCategoryManager.getFilter();
        sparql += ' && ';
        sparql += Global.searchTypeManager.getFilter();

        sparql += ')';

        return sparql;
    },

    _buildOptional: function() {
        let sparql =
            'OPTIONAL { ?urn nco:creator ?creator . } ' +
            'OPTIONAL { ?urn nco:publisher ?publisher . } ';

        return sparql;
    },

    _buildQueryInternal: function(global, flags) {
        let globalSparql =
            'WHERE { ?urn a rdfs:Resource ' +
            this._buildOptional();

        if (global) {
            if ((flags & QueryFlags.UNFILTERED) == 0)
                globalSparql +=
                    Global.searchCategoryManager.getWhere() +
                    Global.collectionManager.getWhere() +
                    this._buildFilterString();

            globalSparql +=
                ' } ' +
                'ORDER BY DESC (?mtime)' +
                ('LIMIT %d OFFSET %d').format(Global.offsetController.getOffsetStep(),
                                              Global.offsetController.getOffset());
        } else {
            if ((flags & QueryFlags.UNFILTERED) == 0)
                globalSparql += this._buildFilterString();

            globalSparql += ' }';
        }

        let sparql =
            'SELECT DISTINCT ?urn ' + // urn
            'nie:url(?urn) ' + // uri
            'nfo:fileName(?urn)' + // filename
            'nie:mimeType(?urn)' + // mimetype
            'nie:title(?urn) ' + // title
            'tracker:coalesce(nco:fullname(?creator), nco:fullname(?publisher), \'\') ' + // author
            'tracker:coalesce(nfo:fileLastModified(?urn), nie:contentLastModified(?urn)) AS ?mtime ' + // mtime
            'nao:identifier(?urn) ' + // identifier
            'rdf:type(?urn) ' + // type
            'nie:dataSource(?urn) ' + // resource URN
            '( EXISTS { ?urn nao:hasTag nao:predefined-tag-favorite } ) ' + // favorite
            '( EXISTS { ?urn nco:contributor ?contributor FILTER ( ?contributor != ?creator ) } ) ' + // shared
            globalSparql;

        return sparql;
    },

    buildSingleQuery: function() {
        let resource = arguments[0];
        let flags = QueryFlags.NONE;

        if (arguments.length == 2)
            flags = arguments[1];

        let sparql = this._buildQueryInternal(false, flags);
        sparql = sparql.replace('?urn', '<' + resource + '>', 'g');

        return new Query(sparql);
    },

    buildGlobalQuery: function() {
        return new Query(this._buildQueryInternal(true, QueryFlags.NONE));
    },

    buildCountQuery: function() {
        let sparql =
            'SELECT DISTINCT COUNT(?urn) WHERE { ' +
            this._buildOptional() +
            this._buildFilterString() +
            '}';

        return new Query(sparql);
    },

    // queries for all the items which are part of the given collection
    buildCollectionIconQuery: function(resource) {
        let sparql =
            ('SELECT ' +
             '?urn ' +
             'tracker:coalesce(nfo:fileLastModified(?urn), nie:contentLastModified(?urn)) AS ?mtime ' +
             'WHERE { ?urn nie:isPartOf ?collUrn } ' +
             'ORDER BY DESC (?mtime)' +
             'LIMIT 4').replace('?collUrn', '<' + resource + '>');

        return new Query(sparql);
    },

    // queries for all the collections the given item is part of
    buildFetchCollectionsQuery: function(resource) {
        let sparql =
            ('SELECT ' +
             '?urn ' +
             'WHERE { ?urn a nfo:DataContainer . ?docUrn nie:isPartOf ?urn }'
            ).replace('?docUrn', '<' + resource + '>');

        return new Query(sparql);
    },

    // adds or removes the given item to the given collection
    buildSetCollectionQuery: function(itemUrn, collectionUrn, setting) {
        let sparql = ('%s { <%s> nie:isPartOf <%s> }'
                     ).format((setting ? 'INSERT' : 'DELETE'), itemUrn, collectionUrn);
        return new Query(sparql);
    },

    // bumps the mtime to current time for the given resource
    buildUpdateMtimeQuery: function(resource) {
        let time = Gd.iso8601_from_timestamp(GLib.get_real_time() / GLib.USEC_PER_SEC);
        let sparql = ('INSERT OR REPLACE { <%s> nie:contentLastModified \"%s\" }'
                     ).format(resource, time);

        return new Query(sparql);
    },

    buildCreateCollectionQuery: function(name) {
        let time = Gd.iso8601_from_timestamp(GLib.get_real_time() / GLib.USEC_PER_SEC);
        let sparql = ('INSERT { _:res a nfo:DataContainer ; a nie:DataObject ; ' +
                      'nie:contentLastModified \"' + time + '\" ; ' +
                      'nie:title \"' + name + '\" ; ' +
                      'nao:identifier \"' + LOCAL_COLLECTIONS_IDENTIFIER + name + '\" }');

        return new Query(sparql);
    },

    buildDeleteResourceQuery: function(resource) {
        let sparql = ('DELETE { <%s> a rdfs:Resource }').format(resource);

        return new Query(sparql);
    }
};
