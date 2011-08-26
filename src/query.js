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

const QueryColumns = {
    URN: 0,
    URI: 1,
    TITLE: 2,
    AUTHOR: 3,
    MTIME: 4,
    IDENTIFIER: 5,
    TYPE: 6,
    RESOURCE_URN: 7,
    FAVORITE: 8,
    TOTAL_COUNT: 9 // only in global query
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

    _buildQueryInternal: function(global) {
        let globalSparql =
            'WHERE { ' +
            'OPTIONAL { ?urn nco:creator ?creator . } ' +
            'OPTIONAL { ?urn nco:publisher ?publisher . } ' +
            '}';

        if (global) {
            globalSparql =
                (this._buildTotalCounter() + // totalCount
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
        }

        let sparql =
            'SELECT DISTINCT ?urn ' + // urn
             'nie:url(?urn) ' + // uri
             'tracker:coalesce(nie:title(?urn), nfo:fileName(?urn)) ' + // title
             'tracker:coalesce(nco:fullname(?creator), nco:fullname(?publisher)) ' + // author
             'tracker:coalesce(nfo:fileLastModified(?urn), nie:contentLastModified(?urn)) AS ?mtime ' + // mtime
             'nao:identifier(?urn) ' + // identifier
             'rdf:type(?urn) ' + // type
             'nie:dataSource(?urn) ' + // resource URN
             '( EXISTS { ?urn nao:hasTag nao:predefined-tag-favorite } ) ' + // favorite
             globalSparql;

        return sparql;
    },

    buildSingleQuery: function(resource) {
        let sparql = this._buildQueryInternal(false);
        return sparql.replace('?urn', '<' + resource + '>', 'g');
    },

    buildGlobalQuery: function() {
        return this._buildQueryInternal(true);
    }
};
