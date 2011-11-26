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

const Gd = imports.gi.Gd;
const Gtk = imports.gi.Gtk;

Gtk.init(null);
let win = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL });

let grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });
win.add(grid);

let entry = new Gd.TaggedEntry();
entry.secondary_icon_name = 'edit-clear-symbolic';
grid.add(entry);

let addBox = new Gtk.Box();
let addButton = new Gtk.Button({ label: "Add" });
addBox.add(addButton);
let addEntry = new Gtk.Entry();
addBox.add(addEntry);

addButton.connect('clicked', function() {
    entry.add_tag(addEntry.get_text(), addEntry.get_text());
});

grid.add(addBox);

win.show_all();
Gtk.main();
