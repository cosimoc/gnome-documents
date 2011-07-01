const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Application = imports.application;

let application = null;
let settings = null;

function start() {
    application = new Application.Application();
    settings = new Gio.Settings({ schema: 'org.gnome.documents' });
    Gtk.main();
}
