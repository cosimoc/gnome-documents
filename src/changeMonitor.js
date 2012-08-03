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

const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Signals = imports.signals;

const Global = imports.global;

const TrackerResourcesServiceIface = <interface name='org.freedesktop.Tracker1.Resources'>
    <signal name="GraphUpdated">
        <arg name="className" type="s" />
        <arg name="deleteEvents" type="a(iiii)" />
        <arg name="insertEvents" type="a(iiii)" />
    </signal>
</interface>;

var TrackerResourcesServiceProxy = Gio.DBusProxy.makeProxyWrapper(TrackerResourcesServiceIface);
function TrackerResourcesService() {
    return new TrackerResourcesServiceProxy(Gio.DBus.session,
                                            'org.freedesktop.Tracker1',
                                            '/org/freedesktop/Tracker1/Resources');
}

const ChangeEventType = {
    CHANGED: 0,
    CREATED: 1,
    DELETED: 2
};

const _RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";


const ChangeEvent = new Lang.Class({
    Name: 'ChangeEvent',

    _init: function(urn, predicate, isDelete) {
        this.urn = urn;

        if (predicate == _RDF_TYPE) {
            if (isDelete)
                this.type = ChangeEventType.DELETED;
            else
                this.type = ChangeEventType.CREATED;
        } else {
            this.type = ChangeEventType.CHANGED;
        }
    },

    merge: function(event) {
        // deletions or creations override the current type
        if (event.type == ChangeEventType.DELETED ||
            event.type == ChangeEventType.CREATED) {
            this.type = event.type;
        }
    }
});

const TrackerChangeMonitor = new Lang.Class({
    Name: 'TrackerChangeMonitor',

    _init: function() {
        this._outstandingOps = 0;
        this._pendingChanges = [];

        this._resourceService = new TrackerResourcesService();
        this._resourceService.connectSignal('GraphUpdated', Lang.bind(this, this._onGraphUpdated));
    },

    _onGraphUpdated: function(proxy, senderName, [className, deleteEvents, insertEvents]) {
        deleteEvents.forEach(Lang.bind(this,
            function(event) {
                this._outstandingOps++;
                this._updateIterator(event, true);
            }));

        insertEvents.forEach(Lang.bind(this,
            function(event) {
                this._outstandingOps++;
                this._updateIterator(event, false);
            }));
    },

    _updateIterator: function(event, isDelete) {
        // we're only interested in the resource URN, as we will query for
        // the item properties again, but we still want to compress deletes and inserts
        Global.connectionQueue.add(
            ('SELECT tracker:uri(%d) tracker:uri(%d) {}').format(event[1], event[2]),
            null, Lang.bind(this,
                function(object, res) {
                    let cursor = object.query_finish(res);

                    cursor.next_async(null, Lang.bind(this,
                        function(object, res) {
                            let valid = cursor.next_finish(res);

                            if (valid) {
                                let subject = cursor.get_string(0)[0];
                                let predicate = cursor.get_string(1)[0];

                                this._addEvent(subject, predicate, isDelete);
                            }

                            cursor.close();

                            this._updateCollector();
                        }));
                }));
    },

    _addEvent: function(subject, predicate, isDelete) {
        let event = new ChangeEvent(subject, predicate, isDelete);
        let oldEvent = this._pendingChanges[subject];

        if (oldEvent != null) {
            oldEvent.merge(event);
            this._pendingChanges[subject] = oldEvent;
        } else {
            this._pendingChanges[subject] = event;
        }
    },

    _updateCollector: function() {
        this._outstandingOps--;

        if (this._outstandingOps == 0) {
            this.emit('changes-pending', this._pendingChanges);
            this._pendingChanges = {};
        }
    }
});
Signals.addSignalMethods(TrackerChangeMonitor.prototype);
