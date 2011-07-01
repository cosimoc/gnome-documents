const Gtk = imports.gi.Gtk;

const Lang = imports.lang;

const Main = imports.main;
const MainToolbar = imports.mainToolbar;
const _ = imports.gettext.gettext;

const _WINDOW_DEFAULT_WIDTH = 825;
const _WINDOW_DEFAULT_HEIGHT = 600;

function MainWindow() {
    this._init();
}

MainWindow.prototype = {
    _init: function() {
        this._initGtkWindow();
        this._initUi();
    },

    _initGtkWindow: function() {
        this.window = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL,
                                       window_position: Gtk.WindowPosition.CENTER,
                                       resizable: false,
                                       title: _('Documents') });

        this.window.set_size_request(_WINDOW_DEFAULT_WIDTH, _WINDOW_DEFAULT_HEIGHT);
        this.window.connect('delete-event',
                            Lang.bind(this, this._onDeleteEvent));
    },

    _initUi: function() {
        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                    vexpand: true });
        this.window.add(this._grid);

        this.toolbar = new MainToolbar.MainToolbar();
        this.toolbar.setOverview();
        this._grid.add(this.toolbar.toolbar);

        this.view = new Gtk.IconView({ hexpand: true,
                                       vexpand: true });
        this._grid.add(this.view);

        this._grid.show_all();
    },

    _onDeleteEvent: function() {
        Main.application.quit();
    }
}
