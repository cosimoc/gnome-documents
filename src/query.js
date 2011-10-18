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
             ' (fn:starts-with (nie:url(?urn), "%s")))').format(desktopURI, documentsURI, downloadsURI);

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

    _buildFilterSearch: function() {
        let filter =
            ('(fn:contains ' +
             '(fn:lower-case (tracker:coalesce(nie:title(?urn), nfo:fileName(?urn))), ' +
             '"%s") ||' +
             'fn:contains ' +
             '(fn:lower-case (tracker:coalesce(nco:fullname(?creator), nco:fullname(?publisher))), ' +
             '"%s"))').format(Global.searchFilterController.getFilter(),
                             Global.searchFilterController.getFilter());

        return filter;
    },

    _buildFilterType: function() {
        let filter =
            '(fn:contains(rdf:type(?urn), \"nfo#PaginatedTextDocument\") ||'
            + 'fn:contains(rdf:type(?urn), \"nfo#Spreadsheet\") ||'
            + 'fn:contains(rdf:type(?urn), \"nfo#Presentation\"))';

        return filter;
    },

    _buildFilterString: function() {
        let sparql = 'FILTER (';

        sparql += '(' + this._buildFilterSearch() + ')';
        sparql += ' && ';
        sparql += Global.sourceManager.getFilter();
        sparql += ' && ';
        sparql += Global.categoryManager.getFilter();
        sparql += ' && ';
        sparql += this._buildFilterType();

        sparql += ')';

        return sparql;
    },

    _buildOptional: function() {
        let sparql =
            'OPTIONAL { ?urn nco:creator ?creator . } ' +
            'OPTIONAL { ?urn nco:publisher ?publisher . } ';

        return sparql;
    },

    _buildQueryInternal: function(global) {
        let globalSparql =
            'WHERE { ?urn a rdfs:Resource ' +
            this._buildOptional();

        if (global) {
            globalSparql +=
                Global.sideFilterController.getWhere() +
                this._buildFilterString() +
                ' } ' +
                'ORDER BY DESC (?mtime)' +
                ('LIMIT %d OFFSET %d').format(Global.offsetController.getOffsetStep(),
                                              Global.offsetController.getOffset());
        } else {
            globalSparql += this._buildFilterString() + ' }';
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

    buildSingleQuery: function(resource) {
        let sparql = this._buildQueryInternal(false);
        sparql = sparql.replace('?urn', '<' + resource + '>', 'g');

        return new Query(sparql);
    },

    buildGlobalQuery: function() {
        return new Query(this._buildQueryInternal(true));
    },

    buildCountQuery: function() {
        let sparql =
            'SELECT DISTINCT COUNT(?urn) WHERE { ' +
            this._buildOptional() +
            this._buildFilterString() +
            '}';

        return new Query(sparql);
    },

    buildCollectionsQuery: function() {
        let sparql = 'SELECT ?urn nie:title(?urn) WHERE { ' +
            '{ ?urn a nfo:DataContainer } ' +
            '{ ?doc nie:isPartOf ?urn } ' +
            'FILTER ((fn:starts-with (nao:identifier(?urn), "gd:collection")) &&' +
            Global.sourceManager.getFilter() +
            ')}';

        return new Query(sparql);
    }
};
