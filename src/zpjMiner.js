/*
 * Copyright (c) 2012 Red Hat, Inc.
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
 * Author: Debarshi Ray <debarshir@gnome.org>
 *
 */

const DBus = imports.dbus;

const ZpjMinerIface = {
    name: 'org.gnome.Documents.ZpjMiner',
    methods: [{ name: 'RefreshDB',
                inSignature: '' }]
};

const ZpjMiner = function() {
    this._init();
};

ZpjMiner.prototype = {
    _init: function() {
        DBus.session.proxifyObject(this,
                                   'org.gnome.Documents.ZpjMiner',
                                   '/org/gnome/Documents/ZpjMiner');
    }
};
DBus.proxifyPrototype(ZpjMiner.prototype, ZpjMinerIface);
