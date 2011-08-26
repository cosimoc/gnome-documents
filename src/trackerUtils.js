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

const GLib = imports.gi.GLib;

const Global = imports.global;

function sourceIdFromResourceUrn(resourceUrn, callback) {
    //FIXME: is this right?
    if(resourceUrn[0] != '<')
        resourceUrn = '<' + resourceUrn + '>';

    let sparql = ('SELECT ?id WHERE { %s a nie:DataSource; nao:identifier ?id }').format(resourceUrn);

    Global.connection.query_async
        (sparql, null,
         function(object, res) {
             let cursor = null;
             try {
                 cursor = object.query_finish(res);
             } catch (e) {
                 log('Unable to resolve resource URN -> account ID: ' + e.toString());
                 return;
             }

             cursor.next_async(null,
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
                 });
         });
}

function resourceUrnFromSourceId(sourceId, callback) {
    let sparql = ('SELECT ?urn WHERE { ?urn a nie:DataSource; nao:identifier \"goa:documents:%s\" }').format(sourceId);

    Global.connection.query_async
        (sparql, null,
         function(object, res) {
             let cursor = null;
             let urn = '';

             try {
                 cursor = object.query_finish(res);
             } catch (e) {
                 log('Unable to resolve account ID -> resource URN: ' + e.toString());

                 callback(urn);
                 return;
             }

             cursor.next_async(null,
                 function(object, res) {
                     try {
                         let valid = cursor.next_finish(res);

                         if (!valid) {
                             callback(urn);
                             return;
                         }
                     } catch (e) {
                         log('Unable to resolve account ID -> resource URN: ' + e.toString());
                         callback(urn);
                         return;
                     }

                     urn = cursor.get_string(0)[0];
                     callback(urn);
                 });
         });
}

function setFavorite(urn, isFavorite, callback) {
    let sparql = ('%s { <%s> nao:hasTag nao:predefined-tag-favorite }').format((isFavorite ? 'INSERT OR REPLACE' : 'DELETE'), urn);

    Global.connection.update_async(sparql,
        GLib.PRIORITY_DEFAULT, null,
        function(object, res) {
            try {
                object.update_finish(res);
            } catch (e) {
                log('Unable to set the favorite property on ' + urn + ' to ' + isFavorite + ': ' + e.toString());
            }

            if (callback)
                callback();
        });
}
